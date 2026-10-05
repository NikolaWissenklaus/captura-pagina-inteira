'use strict';

// Teto de telas por captura. Evita laço sem fim em página com rolagem infinita.
const MAX_SLICES = 60;
// O Chrome aceita no máximo 2 chamadas de captureVisibleTab por segundo.
const CAPTURE_INTERVAL_MS = 550;
const RESULT_URL = chrome.runtime.getURL('result.html');
const DEFAULT_TITLE = chrome.runtime.getManifest().action.default_title;

// Entra como folha de estilo do usuário para valer mesmo contra !important do site.
const CAPTURE_CSS = `
  html, body, [data-cpi-scroller] {
    scroll-behavior: auto !important;
    scroll-snap-type: none !important;
    scrollbar-width: none !important;
  }
  [data-cpi-hide] { visibility: hidden !important; }
`;

let busy = false;
let lastCaptureAt = 0;
// A captura fica só na memória até a aba de resultado buscar. Nada vai para o disco.
let pending = null;

chrome.action.onClicked.addListener(startCapture);

async function startCapture(tab) {
  if (busy || !tab || typeof tab.id !== 'number') return;
  busy = true;
  chrome.action.setTitle({ tabId: tab.id, title: DEFAULT_TITLE }).catch(() => {});
  try {
    const capture = await capturePage(tab);
    pending = capture;
    badge(tab.id, '');
    await chrome.tabs.create({
      url: `${RESULT_URL}#${capture.id}`,
      windowId: tab.windowId,
      index: tab.index + 1,
      openerTabId: tab.id,
    });
  } catch (err) {
    badge(tab.id, '!', '#d93025');
    chrome.action.setTitle({ tabId: tab.id, title: `Falhou: ${explain(err)}` }).catch(() => {});
  } finally {
    busy = false;
  }
}

async function capturePage(tab) {
  const target = { tabId: tab.id };
  const slices = [];
  let truncated = false;
  let m = null;

  await chrome.scripting.insertCSS({ target, css: CAPTURE_CSS, origin: 'USER' });
  try {
    await run(target, pagePrepare);
    let y = 0;
    for (;;) {
      m = checkMetrics(await run(target, pageScroll, [y, slices.length > 0]));
      // Se a rolagem não andou, a página travou o scroll. Para em vez de repetir a mesma tela.
      if (slices.length > 0 && m.y <= slices[slices.length - 1].y) break;

      slices.push({ y: m.y, url: await captureVisible(tab) });
      badge(tab.id, `${Math.min(99, Math.round(((m.y + m.h) / m.total) * 100))}%`);

      if (m.y + m.h >= m.total - 1) break;
      if (slices.length >= MAX_SLICES) {
        truncated = true;
        break;
      }
      y = m.y + m.h;
    }
  } finally {
    await run(target, pageRestore).catch(() => {});
    await chrome.scripting.removeCSS({ target, css: CAPTURE_CSS, origin: 'USER' }).catch(() => {});
  }

  return {
    id: crypto.randomUUID(),
    slices,
    meta: {
      x: m.x,
      top: m.top,
      w: m.w,
      h: m.h,
      vw: m.vw,
      height: slices[slices.length - 1].y + m.h,
      count: slices.length,
      truncated,
      host: hostOf(tab.url),
    },
  };
}

async function captureVisible(tab) {
  // captureVisibleTab fotografa a aba que estiver na frente. Se o usuário trocou
  // de aba no meio, parar é melhor do que fotografar a aba errada.
  const now = await chrome.tabs.get(tab.id);
  if (!now.active) throw new Error('Você trocou de aba durante a captura. Tente de novo sem sair da aba.');

  for (let attempt = 0; ; attempt++) {
    const wait = lastCaptureAt + CAPTURE_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCaptureAt = Date.now();
    try {
      return await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    } catch (err) {
      if (attempt >= 2 || !/MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND/.test(String(err?.message))) throw err;
      await sleep(1000);
    }
  }
}

// Só a aba de resultado desta própria extensão pode buscar a captura.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !sender.url || !sender.url.startsWith(RESULT_URL)) return;
  if (!pending || !msg || msg.id !== pending.id) {
    sendResponse({ error: 'expired' });
    return;
  }
  if (msg.type === 'meta') {
    sendResponse({ meta: pending.meta });
  } else if (msg.type === 'slice' && Number.isInteger(msg.index) && pending.slices[msg.index]) {
    sendResponse({ slice: pending.slices[msg.index] });
  } else if (msg.type === 'done') {
    pending = null;
    sendResponse({});
  } else {
    sendResponse({ error: 'invalid' });
  }
});

async function run(target, func, args = []) {
  const [res] = await chrome.scripting.executeScript({ target, func, args });
  return res ? res.result : null;
}

// Os números vêm de dentro da página. Confere antes de usar.
function checkMetrics(m) {
  const keys = ['y', 'total', 'x', 'top', 'w', 'h', 'vw'];
  if (!m || keys.some((k) => !Number.isFinite(m[k]) || m[k] < 0) || m.w < 1 || m.h < 1 || m.vw < 1) {
    throw new Error('A página mudou durante a captura. Tente de novo.');
  }
  return m;
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function explain(err) {
  const msg = String((err && err.message) || err);
  if (/cannot access|cannot be scripted|extensions gallery|chrome:\/\/|permission/i.test(msg)) {
    return 'o Chrome não deixa extensões capturarem esta página (páginas internas, Chrome Web Store, leitor de PDF).';
  }
  return msg;
}

function badge(tabId, text, color = '#1a73e8') {
  chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {});
  chrome.action.setBadgeText({ tabId, text }).catch(() => {});
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// As três funções abaixo rodam dentro da página, no mundo isolado da extensão.
// O site não enxerga as variáveis delas, e elas só devolvem números.

function pagePrepare() {
  const doc = document.scrollingElement || document.documentElement;
  let el = doc;
  if (doc.scrollHeight <= window.innerHeight + 1) {
    // Apps web costumam rolar dentro de um contêiner e não no documento.
    // Nesse caso captura o maior contêiner rolável.
    let bestArea = window.innerWidth * window.innerHeight * 0.25;
    for (const c of document.querySelectorAll('body, body *')) {
      if (c.scrollHeight <= c.clientHeight + 40) continue;
      const area = c.clientWidth * c.clientHeight;
      if (area <= bestArea) continue;
      const overflow = getComputedStyle(c).overflowY;
      if (overflow !== 'auto' && overflow !== 'scroll') continue;
      el = c;
      bestArea = area;
    }
  }
  if (el !== doc) el.setAttribute('data-cpi-scroller', '');
  globalThis.__cpi = { doc, el, scrollTop: el.scrollTop };
}

async function pageScroll(y, hideOverlays) {
  const s = globalThis.__cpi;
  if (!s) return null;
  const { el, doc } = s;
  const isDoc = el === doc;
  el.scrollTop = y;

  if (hideOverlays) {
    // Cabeçalho fixo ou grudado apareceria repetido em toda tela. Ele já saiu na
    // primeira, então some nas seguintes. Lê tudo antes de escrever para não
    // forçar um recálculo de layout por elemento.
    const base = isDoc ? 0 : el.getBoundingClientRect().top + el.clientTop;
    const changes = [];
    for (const c of document.querySelectorAll('body *')) {
      if (c.contains(el)) continue;
      const cs = getComputedStyle(c);
      if (cs.position === 'fixed') {
        changes.push([c, true]);
      } else if (cs.position === 'sticky') {
        const top = parseFloat(cs.top);
        const stuck = !Number.isNaN(top) && Math.abs(c.getBoundingClientRect().top - base - top) < 2;
        changes.push([c, stuck]);
      }
    }
    for (const [c, hide] of changes) c.toggleAttribute('data-cpi-hide', hide);
  }

  // Espera a página pintar e dá um tempo para imagem com carregamento tardio.
  // O setTimeout cobre o caso de a janela estar minimizada, quando o rAF não dispara.
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
    setTimeout(resolve, 400);
  });
  await new Promise((resolve) => setTimeout(resolve, 150));

  let x = 0;
  let top = 0;
  let w = window.innerWidth;
  let h = window.innerHeight;
  if (!isDoc) {
    const r = el.getBoundingClientRect();
    x = Math.max(0, r.left + el.clientLeft);
    top = Math.max(0, r.top + el.clientTop);
    w = Math.min(window.innerWidth, r.left + el.clientLeft + el.clientWidth) - x;
    h = Math.min(window.innerHeight, r.top + el.clientTop + el.clientHeight) - top;
  }
  return { y: el.scrollTop, total: el.scrollHeight, x, top, w, h, vw: window.innerWidth };
}

function pageRestore() {
  const s = globalThis.__cpi;
  for (const c of document.querySelectorAll('[data-cpi-hide]')) c.removeAttribute('data-cpi-hide');
  for (const c of document.querySelectorAll('[data-cpi-scroller]')) c.removeAttribute('data-cpi-scroller');
  if (s) s.el.scrollTop = s.scrollTop;
  delete globalThis.__cpi;
}
