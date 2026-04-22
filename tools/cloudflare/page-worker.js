/* global HTMLRewriter */

/**
 * Full-page ESI Cloudflare Worker.
 *
 * Intercepts every HTML page response from the EDS origin, finds `.esi` blocks
 * (authored as EDS block tables), fetches their `embedPath` content from
 * the upstream source, and inlines the HTML before the page reaches the browser.
 *
 * Deploy this Worker on: yourdomain.com/* (route priority below /api/esi-fragment*)
 *
 * Environment variables:
 *   ALLOWED_EMBED_HOSTS  Comma-separated allowlist of embed source hostnames.
 *                        Leave empty to allow any https source (not recommended for prod).
 *   ESI_TIMEOUT_MS       Per-fragment fetch timeout in ms (default: 5000).
 *   ORIGIN_HOST          Optional EDS origin hostname to proxy from
 *                        (e.g. main--repo--org.aem.live). Omit if the Worker
 *                        is deployed on the same host as the origin.
 */

const DEFAULT_TIMEOUT_MS = 5000;
const FRAG_START = '<!--esi-s-->';
const FRAG_END = '<!--esi-e-->';

function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseAllowedHosts(env) {
  return (env.ALLOWED_EMBED_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowedSource(url, env) {
  if (!['http:', 'https:'].includes(url.protocol)) return false;
  const allowed = parseAllowedHosts(env);
  return allowed.length === 0 || allowed.includes(url.hostname.toLowerCase());
}

async function fetchWithTimeout(urlStr, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(urlStr, {
      signal: controller.signal,
      headers: { accept: 'text/html,application/xhtml+xml' },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Phase 0 — pre-mark raw ESI tables that appear nested inside other EDS blocks
 * (e.g. inside a columns block). EDS renders those as plain <table> elements
 * with no `.esi` class, because the block JS hasn't run yet. We detect them by
 * their header cell text ("esi") and add a `data-esi-table` attribute so the
 * HTMLRewriter in Phase 1 can select them alongside top-level `.esi` divs.
 *
 * Input pattern (after EDS renders to HTML, before JS runs):
 *   <table>
 *     <thead><tr><th colspan="2">esi</th></tr></thead>
 *     <tbody>
 *       <tr><td>embedPath</td><td>https://…</td></tr>
 *       <tr><td>fallbackMessage</td><td>…</td></tr>
 *     </tbody>
 *   </table>
 */
function preMarkEsiTables(html) {
  // Match common EDS table shapes where the table identifies itself as "esi":
  // 1) thead > tr > th = "esi"
  // 2) first tbody row first cell = "esi"
  // We add data-esi-table to the <table> opening tag in both cases.
  const withTheadMarked = html.replace(
    /(<table(?:[^>]*)>)((?:\s|<!--.*?-->)*<thead(?:[^>]*)>(?:\s|<!--.*?-->)*<tr(?:[^>]*)>(?:\s|<!--.*?-->)*<th(?:[^>]*)>\s*esi\s*<\/th>)/gis,
    (match, tableTag, rest) => {
      if (tableTag.includes('data-esi-table')) return match;
      return tableTag.replace('<table', '<table data-esi-table') + rest;
    },
  );

  return withTheadMarked.replace(
    /(<table(?:[^>]*)>)((?:\s|<!--.*?-->)*<tbody(?:[^>]*)>(?:\s|<!--.*?-->)*<tr(?:[^>]*)>(?:\s|<!--.*?-->)*(?:<t[dh](?:[^>]*)>\s*esi\s*<\/t[dh]>))/gis,
    (match, tableTag, rest) => {
      if (tableTag.includes('data-esi-table')) return match;
      return tableTag.replace('<table', '<table data-esi-table') + rest;
    },
  );
}

/**
 * Phase 1 — scan the page HTML, stamp each `.esi` block (div format) and each
 * ESI table (pre-marked with data-esi-table) with a unique `data-esi-id`
 * attribute, and collect embedPath / selector / fallbackMessage config.
 *
 * Two supported shapes:
 *
 * A) Top-level EDS block div (class="esi"):
 *   <div class="esi">
 *     <div><div>embedPath</div><div><a href="…">…</a></div></div>
 *     <div><div>selector</div><div>.hero-banner</div></div>
 *   </div>
 *
 * B) Nested inside another block (rendered as a raw table):
 *   <table data-esi-table>
 *     <thead><tr><th>esi</th></tr></thead>
 *     <tbody>
 *       <tr><td>embedPath</td><td>https://…</td></tr>
 *       <tr><td>selector</td><td>.hero-banner</td></tr>
 *     </tbody>
 *   </table>
 *
 * Cloudflare HTMLRewriter does not support :nth-child(), so cell position is
 * tracked via a shared counter reset on each row boundary.
 */
async function markAndCollect(rawHtml) {
  // Pre-pass: add data-esi-table to any ESI tables nested inside other blocks.
  const html = preMarkEsiTables(rawHtml);

  const blocks = [];
  let currentBlock = null;
  let cellIndex = 0;
  let keyText = '';

  function onBlock(block) {
    currentBlock = block;
    blocks.push(block);
    cellIndex = 0;
    keyText = '';
  }

  function onRow() {
    cellIndex = 0;
    keyText = '';
  }

  function onCellStart() {
    cellIndex += 1;
  }

  function onCellText(text) {
    if (cellIndex === 1) {
      keyText += text;
      return;
    }
    if (cellIndex !== 2 || !currentBlock) return;
    const key = keyText.trim().toLowerCase().replace(/[\s-]/g, '');
    if (key === 'selector') currentBlock.selector += text;
    if (key === 'fallbackmessage') currentBlock.fallbackMessage += text;
    if (key === 'embedpath') currentBlock.embedPath += text;
  }

  function onAnchor(href) {
    if (!currentBlock || cellIndex !== 2) return;
    const key = keyText.trim().toLowerCase().replace(/[\s-]/g, '');
    // Prefer the href over the text node value for embedPath (handles link formatting)
    if (key === 'embedpath' && href) currentBlock.embedPath = href;
  }

  const markedHtml = await new HTMLRewriter()
    // ── Format A: top-level .esi div blocks ──────────────────────────────────
    .on('.esi', {
      element(el) {
        const id = `esi${blocks.length}`;
        el.setAttribute('data-esi-id', id);
        onBlock({
          id, embedPath: '', selector: '', fallbackMessage: '',
        });
      },
    })
    .on('.esi > div', {
      element() { onRow(); },
    })
    .on('.esi > div > div', {
      element() { onCellStart(); },
      text({ text }) { onCellText(text); },
    })
    .on('.esi > div > div a', {
      element(el) { onAnchor(el.getAttribute('href') || ''); },
    })
    // ── Format B: ESI tables pre-marked with data-esi-table ──────────────────
    .on('[data-esi-table]', {
      element(el) {
        const id = `esi${blocks.length}`;
        el.setAttribute('data-esi-id', id);
        onBlock({
          id, embedPath: '', selector: '', fallbackMessage: '',
        });
      },
    })
    .on('[data-esi-table] tr', {
      element() { onRow(); },
    })
    .on('[data-esi-table] tr td', {
      element() { onCellStart(); },
      text({ text }) { onCellText(text); },
    })
    .on('[data-esi-table] tr th', {
      element() { onCellStart(); },
      text({ text }) { onCellText(text); },
    })
    .on('[data-esi-table] tr td a', {
      element(el) { onAnchor(el.getAttribute('href') || ''); },
    })
    .on('[data-esi-table] tr th a', {
      element(el) { onAnchor(el.getAttribute('href') || ''); },
    })
    .transform(new Response(html))
    .text();

  blocks.forEach((block) => {
    // eslint-disable-next-line no-param-reassign
    block.selector = block.selector.trim();
    // eslint-disable-next-line no-param-reassign
    block.fallbackMessage = block.fallbackMessage.trim();
    // eslint-disable-next-line no-param-reassign
    block.embedPath = block.embedPath.trim();
  });

  return { blocks, markedHtml };
}

/**
 * Extract a CSS-selector-matched element (or the body's inner HTML when no
 * selector is given) from upstream HTML using HTMLRewriter sentinels.
 */
async function extractFromHtml(html, selector) {
  let rewriter = new HTMLRewriter();

  if (selector) {
    rewriter = rewriter.on(selector, {
      element(el) {
        el.before(FRAG_START, { html: true });
        el.after(FRAG_END, { html: true });
      },
    });
  } else {
    rewriter = rewriter.on('body', {
      element(el) {
        el.prepend(FRAG_START, { html: true });
        el.append(FRAG_END, { html: true });
      },
    });
  }

  const marked = await rewriter.transform(new Response(html)).text();
  const start = marked.indexOf(FRAG_START);
  const end = marked.indexOf(FRAG_END);

  if (start === -1 || end === -1 || end <= start) {
    return selector ? null : html.trim() || null;
  }

  return marked.slice(start + FRAG_START.length, end).trim() || null;
}

async function fetchFragment(block, requestUrl, env) {
  if (!block.embedPath) return null;

  const timeoutMs = Number(env.ESI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  let sourceUrl;
  try {
    sourceUrl = new URL(block.embedPath, requestUrl);
  } catch {
    return null;
  }

  if (!isAllowedSource(sourceUrl, env)) return null;

  let response;
  try {
    response = await fetchWithTimeout(sourceUrl.toString(), timeoutMs);
  } catch {
    return null;
  }

  if (!response.ok) return null;

  const ct = response.headers.get('content-type') || '';
  if (!ct.includes('text/html') && !ct.includes('application/xhtml+xml')) return null;

  const upstreamHtml = await response.text();
  return extractFromHtml(upstreamHtml, block.selector || null);
}

const EDS_EMBED_SCRIPT = '<script>(()=>{if(customElements.get("eds-embed"))return;customElements.define("eds-embed",class extends HTMLElement{connectedCallback(){if(this.shadowRoot)return;const shadow=this.attachShadow({mode:"open"});while(this.firstChild)shadow.append(this.firstChild);}});})();</script>';

function wrapFragment(html) {
  return `<eds-embed data-esi-injected>${html}</eds-embed>`;
}

/**
 * Phase 2 — replace each marked `.esi` block with its fetched fragment HTML wrapped in web component.
 * Blocks whose fetch failed are left in place so the client-side JS fallback can still attempt them.
 */
function substitute(markedHtml, blockContents, blockConfigById) {
  let rewriter = new HTMLRewriter();
  let hasWrappedEmbeds = false;

  blockContents.forEach((fragmentHtml, id) => {
    const blockConfig = blockConfigById.get(id);
    if (!fragmentHtml && !blockConfig?.fallbackMessage) return;

    rewriter = rewriter.on(`[data-esi-id="${id}"]`, {
      element(el) {
        if (fragmentHtml) {
          hasWrappedEmbeds = true;
          el.replace(wrapFragment(fragmentHtml), { html: true });
          return;
        }

        el.replace(`<div data-esi-fallback>${escapeHtml(blockConfig.fallbackMessage)}</div>`, { html: true });
      },
    });
  });

  if (hasWrappedEmbeds) {
    rewriter = rewriter.on('body', {
      element(el) {
        el.append(EDS_EMBED_SCRIPT, { html: true });
      },
    });
  }

  return rewriter.transform(new Response(markedHtml, { headers: { 'content-type': 'text/html' } }));
}

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return fetch(request);
    }

    let upstreamRequest = request;
    if (env.ORIGIN_HOST) {
      const originUrl = new URL(request.url);
      originUrl.hostname = env.ORIGIN_HOST;
      upstreamRequest = new Request(originUrl.toString(), {
        method: request.method,
        headers: request.headers,
      });
    }

    const pageResponse = await fetch(upstreamRequest);

    const ct = pageResponse.headers.get('content-type') || '';
    if (!ct.includes('text/html') && !ct.includes('application/xhtml+xml')) {
      return pageResponse;
    }

    const pageHtml = await pageResponse.text();
    const { blocks, markedHtml } = await markAndCollect(pageHtml);
    const blockConfigById = new Map(blocks.map((b) => [b.id, b]));

    if (blocks.length === 0) {
      return new Response(pageHtml, {
        status: pageResponse.status,
        headers: pageResponse.headers,
      });
    }

    const entries = await Promise.all(
      blocks.map(async (b) => [b.id, await fetchFragment(b, request.url, env)]),
    );
    const blockContents = new Map(entries);

    const transformed = substitute(markedHtml, blockContents, blockConfigById);

    const responseHeaders = new Headers(pageResponse.headers);
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');

    return new Response(transformed.body, {
      status: pageResponse.status,
      headers: responseHeaders,
    });
  },
};
