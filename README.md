# Captura de Página Inteira

Extensão para o Chrome que tira um print da página inteira, do topo ao rodapé, sem mandar nada para lugar nenhum.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-1a73e8)
![Chrome 116+](https://img.shields.io/badge/Chrome-116%2B-1a73e8)
![Sem rede](https://img.shields.io/badge/rede-bloqueada-188038)
![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-5f6368)

## Por que esta extensão existe

Nos últimos meses saíram várias notícias de extensões de navegador que roubavam dados dos usuários. Muitas delas eram justamente extensões de screenshot: para "tirar print", pediam permissão para ler todos os sites o tempo todo e, em algum momento, passavam a enviar o que viam para servidores de terceiros.

Quem precisa tirar print de página inteira com frequência (suporte, QA, jurídico, marketing, quem guarda comprovante) acaba instalando uma dessas sem perceber o risco.

Esta extensão foi feita para resolver o mesmo problema sem esse risco:

- **Não tem acesso a nenhum site** até você clicar no ícone.
- **Não tem como enviar dados para fora.** O código não faz nenhuma chamada de rede, e a política de segurança da extensão faz o próprio Chrome bloquear qualquer conexão.
- **Não usa biblioteca de terceiros** nem baixa código de fora. Tudo o que roda está nesta pasta.
- **O código é curto e legível.** São dois arquivos de JavaScript com cerca de 400 linhas no total. Dá para ler tudo em poucos minutos.

## Funcionalidades

- Captura a página inteira, não só a parte visível.
- Esconde cabeçalhos fixos para eles não aparecerem repetidos na imagem.
- Funciona em apps que rolam dentro de um painel (webmail, chat, painéis administrativos).
- Salva em **PNG** (qualidade máxima) ou **JPG** (arquivo menor), ou **copia** direto para colar em chat ou documento.
- Atalho de teclado: <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd>.
- Mostra o progresso em porcentagem no próprio ícone.
- Páginas muito altas saem divididas em partes, cada uma com seus botões.
- Devolve a página para a posição de rolagem em que estava.

## Instalação

A extensão não está na Chrome Web Store. Ela é carregada direto de uma pasta, o que leva menos de um minuto.

1. **Baixe o código.** Clique em `Code` > `Download ZIP` aqui no GitHub e extraia o arquivo, ou clone:
   ```bash
   git clone https://github.com/NikolaWissenklaus/captura-pagina-inteira.git
   ```
   Deixe a pasta em um lugar definitivo. Se ela for movida ou apagada depois, a extensão some do Chrome.
2. **Abra a página de extensões.** Cole `chrome://extensions` na barra de endereço e aperte Enter.
3. **Ligue o Modo do desenvolvedor**, na chave do canto superior direito.
4. **Clique em "Carregar sem compactação"** e selecione a pasta `captura-pagina-inteira` que fica **dentro** do repositório (é a que contém o `manifest.json`).
5. **Fixe o ícone.** Clique na peça de quebra-cabeça ao lado da barra de endereço e no alfinete ao lado de "Captura de Página Inteira".

> Como a extensão não veio da loja, o Chrome pode mostrar um aviso sobre "extensões no modo de desenvolvedor" ao abrir. É normal para qualquer extensão carregada de uma pasta. Basta fechar o aviso. Não desligue o Modo do desenvolvedor, senão a extensão é desativada.

Também funciona em navegadores baseados no Chromium que aceitam extensões sem compactação, como Edge e Brave.

## Como usar

1. Abra a página que quer capturar e espere ela carregar.
2. Clique no ícone azul ou aperte <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd>.
3. Fique na aba enquanto a página rola sozinha. Cada tela leva cerca de meio segundo, porque o Chrome limita as capturas a duas por segundo.
4. Uma aba nova abre com a imagem pronta. Escolha **Salvar PNG**, **Salvar JPG** ou **Copiar**.

Se o ícone mostrar um **!** vermelho, passe o mouse sobre ele para ver o motivo. Se o atalho não funcionar, outro programa já usa essa combinação: troque em `chrome://extensions/shortcuts`.

## Como funciona

O Chrome só deixa uma extensão fotografar o que está visível na janela. Para pegar a página inteira, a extensão:

1. Rola a página uma tela por vez.
2. Fotografa cada tela com `chrome.tabs.captureVisibleTab`.
3. Mede a posição real da rolagem em cada passo.
4. Cola as fotos uma embaixo da outra num `canvas`, na aba de resultado.

As fotos ficam só na memória e são descartadas assim que a imagem é montada. Nada é gravado em disco até você clicar em salvar.

## Segurança e privacidade

| Item | Nesta extensão | O que significa |
| --- | --- | --- |
| `activeTab` | usa | Acesso só à aba atual e só depois do seu clique ou atalho. O acesso termina quando a aba muda de página. |
| `scripting` | usa | Permite rolar a página e medir a altura dela. Só funciona na aba liberada pelo `activeTab`. |
| Ler todos os sites (`host_permissions`) | não pede | Nada roda nas páginas enquanto você navega. Sem clique, a extensão fica parada. |
| Histórico, cookies, abas, downloads, armazenamento | não pede | O Chrome nega essas funções a quem não declarou a permissão. |
| Rede | bloqueada | Não existe `fetch`, `XMLHttpRequest` nem `WebSocket` no código, e a CSP `default-src 'none'` faz o Chrome recusar qualquer conexão a partir da aba de resultado. |
| Código remoto | não existe | Só rodam os arquivos da pasta. |
| Disco | não grava | A captura vive na memória até a imagem ser montada. |

Outras proteções no código:

- O trecho que roda dentro da página fica no **mundo isolado** da extensão. O site não enxerga nem altera as variáveis dele, e ele só devolve números (posição e altura), que são conferidos antes de serem usados.
- Só a aba de resultado da própria extensão consegue buscar a captura, e precisa apresentar um identificador aleatório gerado a cada captura. Sites e outras extensões não conseguem pedir a imagem.
- Se você trocar de aba no meio da captura, ela para. Assim nunca fotografa uma aba diferente da que você escolheu.
- Texto vindo do site (o endereço) é escrito na tela como texto puro, nunca como HTML.

### Confira você mesmo

Não precisa confiar no que está escrito aqui:

1. Em `chrome://extensions`, clique em **Detalhes** no cartão da extensão. Não pode aparecer "Ler e alterar todos os seus dados em todos os sites".
2. Abra o `manifest.json`. O campo `permissions` lista só `activeTab` e `scripting`, e não existe `host_permissions`.
3. No mesmo cartão, clique em **service worker**, abra a aba **Network** do DevTools e tire um print. A lista fica vazia.
4. Procure por `fetch`, `XMLHttpRequest` ou `http` em `background.js` e `result.js`. Não há nenhum.

## Limitações conhecidas

- **Páginas protegidas pelo Chrome**: `chrome://`, Chrome Web Store, página de nova aba e o leitor de PDF não aceitam nenhuma extensão.
- **Arquivos locais** (`file://`): ligue "Permitir acesso a URLs de arquivo" nos detalhes da extensão.
- **Janela anônima**: ligue "Permitir em modo anônimo" nos detalhes da extensão.
- **Rolagem infinita**: a captura para em 60 telas para não rodar para sempre em feeds.
- **Páginas muito altas**: o Chrome não cria imagens com mais de cerca de 32 mil pixels de altura. Acima disso, a captura sai em partes.
- **Itens fixos no rodapé**: um botão de chat ou aviso de cookies preso na base da janela aparece uma vez, na altura da primeira tela.

## Estrutura do projeto

```
captura-pagina-inteira/
├── manifest.json    # nome, permissões, atalho e política de segurança (CSP)
├── background.js    # rola a página, fotografa cada tela e guarda na memória
├── result.html      # aba que mostra a imagem pronta
├── result.js        # monta as telas num canvas e oferece salvar/copiar
├── result.css
└── icons/
COMO-INSTALAR.html   # guia ilustrado de instalação e uso
```

## Atualizar e remover

- **Atualizar**: baixe a versão nova por cima da pasta e clique na seta circular do cartão da extensão em `chrome://extensions`.
- **Remover**: clique em **Remover** no cartão. Depois a pasta pode ser apagada. A extensão não deixa nada para trás, porque não grava dados.

## Contribuindo

Sugestões e correções são bem-vindas por issue ou pull request. Como a proposta da extensão é ser auditável, alterações que adicionem permissões, chamadas de rede ou dependências externas não serão aceitas.

## Licença

Distribuído sob a licença [MIT](LICENSE).
