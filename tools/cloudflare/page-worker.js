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
 * Phase 1 — scan the page HTML, stamp each `.esi` block with a unique
 * `data-esi-id` attribute, and collect its embedPath + selector config
 * from the EDS two-column block table structure.
 *
 * EDS block table shape (before JS decoration):
 *   <div class="esi">
 *     <div>                      ← row
 *       <div>embedPath</div>     ← key cell  (cellIndex 1)
 *       <div><a href="…">…</a></div>  ← value cell (cellIndex 2)
 *     </div>
 *     <div>
 *       <div>selector</div>
 *       <div>.hero-banner</div>
 *     </div>
 *   </div>
 *
 * Cloudflare HTMLRewriter does not support :nth-child(), so cell position is
 * tracked with a counter reset on each row.
 */
async function markAndCollect(html) {
  const blocks = [];
  let currentBlock = null;
  let cellIndex = 0;
  let keyText = '';

  const markedHtml = await new HTMLRewriter()
    .on('.esi', {
      element(el) {
        const id = `esi${blocks.length}`;
        el.setAttribute('data-esi-id', id);
        currentBlock = { id, embedPath: '', selector: '' };
        blocks.push(currentBlock);
        cellIndex = 0;
        keyText = '';
      },
    })
    .on('.esi > div', {
      element() {
        cellIndex = 0;
        keyText = '';
      },
    })
    .on('.esi > div > div', {
      element() {
        cellIndex += 1;
      },
      text({ text }) {
        if (cellIndex === 1) {
          keyText += text;
          return;
        }
        if (cellIndex !== 2 || !currentBlock) return;
        const key = keyText.trim().toLowerCase().replace(/[\s-]/g, '');
        if (key === 'selector') currentBlock.selector += text;
      },
    })
    .on('.esi > div > div a', {
      element(el) {
        if (!currentBlock || cellIndex !== 2) return;
        const key = keyText.trim().toLowerCase().replace(/[\s-]/g, '');
        if (key === 'embedpath' && !currentBlock.embedPath) {
          currentBlock.embedPath = el.getAttribute('href') || '';
        }
      },
    })
    .transform(new Response(html))
    .text();

  blocks.forEach((block) => {
    // eslint-disable-next-line no-param-reassign
    block.selector = block.selector.trim();
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
function substitute(markedHtml, blockContents) {
  let rewriter = new HTMLRewriter();

  blockContents.forEach((fragmentHtml, id) => {
    if (!fragmentHtml) return;
    rewriter = rewriter.on(`[data-esi-id="${id}"]`, {
      element(el) {
        el.replace(wrapFragment(fragmentHtml), { html: true });
      },
    });
  });

  // Inject the eds-embed custom element bootstrap
  rewriter = rewriter.on('body', {
    element(el) {
      el.append(EDS_EMBED_SCRIPT, { html: true });
    },
  });

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

    const transformed = substitute(markedHtml, blockContents);

    const responseHeaders = new Headers(pageResponse.headers);
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');

    return new Response(transformed.body, {
      status: pageResponse.status,
      headers: responseHeaders,
    });
  },
};
