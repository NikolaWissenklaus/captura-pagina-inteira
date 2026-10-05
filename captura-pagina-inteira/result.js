'use strict';

// Limites do canvas no Chrome. Página maior que isso sai dividida em partes.
const MAX_DIM = 32000;
const MAX_AREA = 250000000;

const id = location.hash.slice(1);
const $title = document.getElementById('title');
const $status = document.getElementById('status');
const $parts = document.getElementById('parts');

main().catch((err) => fail(String((err && err.message) || err)));

async function main() {
  const first = await ask({ type: 'meta' });
  if (!first || first.error) {
    fail('Esta captura não está mais na memória. Volte para a página e capture de novo.');
    return;
  }
  const meta = first.meta;
  if (meta.host) $title.textContent = `Captura de ${meta.host}`;

  let canvases = null;
  let geo = null;
  for (let i = 0; i < meta.count; i++) {
    $status.textContent = `Montando a imagem... tela ${i + 1} de ${meta.count}`;
    const { slice } = await ask({ type: 'slice', index: i });
    const img = await loadImage(slice.url);
    if (!canvases) {
      geo = geometry(meta, img);
      canvases = createCanvases(geo);
    }
    // floor na posição e ceil na altura do recorte: as telas se sobrepõem em vez
    // de deixar uma linha vazia quando a escala da tela é fracionária (125%, 150%).
    const dy = Math.floor(slice.y * geo.scale);
    canvases.forEach((canvas, p) => {
      const offset = dy - p * geo.partHeight;
      if (offset >= canvas.height || offset + geo.sh <= 0) return;
      canvas.getContext('2d').drawImage(img, geo.sx, geo.sy, geo.sw, geo.sh, 0, offset, geo.sw, geo.sh);
    });
  }
  // Libera as telas guardadas no service worker.
  await ask({ type: 'done' });

  const stamp = timestamp();
  const host = (meta.host || 'pagina').replace(/[^a-z0-9.-]/gi, '_').slice(0, 60);
  for (let p = 0; p < canvases.length; p++) {
    const suffix = canvases.length > 1 ? `_parte${p + 1}` : '';
    await renderPart(canvases[p], `captura_${host}_${stamp}${suffix}`, p, canvases.length);
  }

  const notes = [];
  if (canvases.length > 1) notes.push(`A página é mais alta que o limite de imagem do Chrome, por isso saiu em ${canvases.length} partes.`);
  if (meta.truncated) notes.push(`A captura parou em ${meta.count} telas, que é o limite por captura.`);
  $status.textContent = ['Pronto.', ...notes].join(' ');
}

function geometry(meta, img) {
  // A escala cobre zoom da página e tela de alta densidade de uma vez.
  const scale = img.naturalWidth / meta.vw;
  const sx = Math.round(meta.x * scale);
  const sy = Math.round(meta.top * scale);
  const sw = Math.max(1, Math.min(Math.round(meta.w * scale), img.naturalWidth - sx));
  const sh = Math.max(1, Math.min(Math.ceil(meta.h * scale), img.naturalHeight - sy));
  const height = Math.max(1, Math.round(meta.height * scale));
  const partHeight = Math.max(1, Math.min(MAX_DIM, Math.floor(MAX_AREA / sw)));
  return { scale, sx, sy, sw, sh, height, partHeight };
}

function createCanvases(geo) {
  const list = [];
  for (let start = 0; start < geo.height; start += geo.partHeight) {
    const canvas = document.createElement('canvas');
    canvas.width = geo.sw;
    canvas.height = Math.min(geo.partHeight, geo.height - start);
    list.push(canvas);
  }
  return list;
}

async function renderPart(canvas, name, index, total) {
  const png = await toBlob(canvas, 'image/png');

  const section = document.createElement('section');
  section.className = 'part';
  const bar = document.createElement('div');
  bar.className = 'bar';

  const info = document.createElement('span');
  info.className = 'info';
  const label = total > 1 ? `Parte ${index + 1} de ${total} · ` : '';
  info.textContent = `${label}${canvas.width} × ${canvas.height} px · ${formatSize(png.size)}`;

  const savePng = button('Salvar PNG', 'primary', () => download(png, `${name}.png`));
  const saveJpg = button('Salvar JPG', '', async () => {
    download(await toBlob(canvas, 'image/jpeg', 0.92), `${name}.jpg`);
  });
  const copy = button('Copiar', '', async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      flash(copy, 'Copiado');
    } catch {
      flash(copy, 'Não deu para copiar');
    }
  });

  const preview = document.createElement('img');
  preview.alt = total > 1 ? `Parte ${index + 1} da captura` : 'Captura da página';
  preview.src = URL.createObjectURL(png);

  bar.append(info, savePng, saveJpg, copy);
  section.append(bar, preview);
  $parts.append(section);
}

function button(text, className, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  if (className) b.className = className;
  b.addEventListener('click', onClick);
  return b;
}

function flash(el, text) {
  const original = el.textContent;
  el.textContent = text;
  setTimeout(() => {
    el.textContent = original;
  }, 1500);
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function ask(msg) {
  return chrome.runtime.sendMessage({ ...msg, id });
}

function loadImage(url) {
  const img = new Image();
  img.src = url;
  return img.decode().then(() => img);
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível gerar a imagem.'))), type, quality);
  });
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function fail(text) {
  $status.textContent = text;
  $status.className = 'error';
}
