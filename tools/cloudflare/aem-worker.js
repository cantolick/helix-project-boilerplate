/* global HTMLRewriter, caches */

/**
 * aem-worker — full-page Cloudflare Worker for craigantolick.com
 *
 * Routes: www.craigantolick.com/*, hlx.craigantolick.com/*
 *
 * Responsibilities:
 *  1. CDN proxy: rewrites requests to EDS origin, sets required headers
 *  2. /llms.txt + /llms-full.txt: generated from query-index.json
 *  3. Blogfeed: static HTML + JSON-LD injection for pages with a blogfeed block
 *  4. ESI: server-side inline substitution of .esi blocks before the page
 *     reaches the browser (ALLOWED_EMBED_HOSTS restricts embed sources)
 *  5. Query-param sanitisation, port redirect, /drafts/ → 404
 *
 * Environment variables:
 *   ORIGIN_HOSTNAME        EDS origin hostname
 *                          (default: main--helix-project-boilerplate--cantolick.aem.live)
 *   ORIGIN_AUTHENTICATION  Optional bearer token for origin auth
 *   PUSH_INVALIDATION      Set to "disabled" to suppress x-push-invalidation header
 *   SITE_HOSTNAME          Public hostname of the site (e.g. www.craigantolick.com).
 *                          Defaults to the Host header of the incoming request.
 *                          Used for llms.txt base URLs and blog feed x-forwarded-host.
 *   ALLOWED_EMBED_HOSTS    Comma-separated allowlist of ESI embed source hostnames
 *   ESI_TIMEOUT_MS         Per-fragment fetch timeout in ms (default: 5000)
 */

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

const getExtension = (path) => {
  const basename = path.split('/').pop();
  const pos = basename.lastIndexOf('.');
  return (basename === '' || pos < 1) ? '' : basename.slice(pos + 1);
};

const isMediaRequest = (url) => /\/media_[0-9a-f]{40,}[/a-zA-Z0-9_-]*\.[0-9a-z]+$/.test(url.pathname);
const isRUMRequest = (url) => /\/\.(rum|optel)\/.*/.test(url.pathname);

// ---------------------------------------------------------------------------
// llms.txt / blog feed helpers
// ---------------------------------------------------------------------------

const getLlmsBaseUrl = (siteHostname) => `https://${siteHostname}`;
const getLlmsCacheKey = (siteHostname) => new Request(`https://${siteHostname}/llms.txt`);
const getLlmsFullCacheKey = (siteHostname) => new Request(`https://${siteHostname}/llms-full.txt`);
const getBlogFeedCacheKey = (siteHostname) => new Request(`https://${siteHostname}/__blog-feed-entries`);

const sanitizeDescription = (raw) => {
  if (!raw || typeof raw !== 'string') return '';
  const collapsed = raw.replace(/[\r\n]+/g, ' ').trim();
  if (collapsed.length <= 200) return collapsed;
  const truncated = collapsed.slice(0, 200);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
};

const escapeHtml = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

// EDS stores dates as Excel serial numbers (days since 1899-12-30).
// Values >1e9 are Unix ms; values >1e6 are Unix seconds; else Excel serial.
const EXCEL_EPOCH_MS = new Date(Date.UTC(1899, 11, 30)).getTime();

const excelSerialToDate = (serial) => new Date(EXCEL_EPOCH_MS + Math.floor(serial) * 86400000);

const numericDateToDisplay = (numVal) => {
  let date;
  if (numVal > 1e9) {
    date = new Date(numVal);
  } else if (numVal > 1e6) {
    date = new Date(numVal * 1000);
  } else {
    date = excelSerialToDate(numVal);
  }
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

const getDisplayDate = (entry) => {
  const lm = entry.lastModified;
  if (lm && typeof lm === 'string' && lm.trim() && !/^\d+(\.\d+)?$/.test(lm.trim())) {
    return lm.trim();
  }
  const numVal = typeof entry.date === 'number' ? entry.date : Number(entry.date);
  if (numVal && !Number.isNaN(numVal)) return numericDateToDisplay(numVal);
  return '';
};

const getIsoDate = (entry) => {
  const numVal = typeof entry.date === 'number' ? entry.date : Number(entry.date);
  if (numVal && !Number.isNaN(numVal)) {
    let date;
    if (numVal > 1e9) {
      date = new Date(numVal);
    } else if (numVal > 1e6) {
      date = new Date(numVal * 1000);
    } else {
      date = excelSerialToDate(numVal);
    }
    if (!Number.isNaN(date.getTime()) && date.getFullYear() > 1972) {
      return date.toISOString().split('T')[0];
    }
  }
  if (entry.lastModified) {
    const parsed = new Date(entry.lastModified);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  }
  return '';
};

const buildLlmsTxt = (entries, siteHostname) => {
  const baseUrl = getLlmsBaseUrl(siteHostname);
  const header = [
    '# Craig Antolick',
    '',
    '> Personal blog covering web development, Edge Delivery Services, and technology.',
    '',
    '## About',
    '',
    '- Craig Antolick is a senior web engineer specializing in Edge Delivery Services, Adobe AEM, Cloudflare, and AI-assisted development workflows.',
    '- Content targets developers building on or migrating to Edge Delivery Services.',
    '- Posts span 2017\u20132026.',
    '',
    '## Blog',
  ];

  if (!entries.length) {
    return header.join('\n') + '\n';
  }

  const lines = entries.map((e) => {
    const rawTitle = (e.title && typeof e.title === 'string' && e.title.trim())
      ? e.title.trim()
      : e.path.split('/').filter(Boolean).pop() || e.path;
    const title = rawTitle.replace(/]/g, '\\]');
    const absUrl = `${baseUrl}${e.path}`;
    const description = sanitizeDescription(e.description);
    return description
      ? `- [${title}](${absUrl}): ${description}`
      : `- [${title}](${absUrl})`;
  });

  return [
    ...header,
    '',
    ...lines,
    '',
    '## Full Content',
    '',
    `- [llms-full.txt](${baseUrl}/llms-full.txt): Full inline content of all posts for LLM indexing`,
    '',
  ].join('\n');
};

const buildLlmsFullTxt = (entries, siteHostname) => {
  const baseUrl = getLlmsBaseUrl(siteHostname);
  const header = [
    '# Craig Antolick \u2014 Full Content Index',
    '',
    '> All blog post content inline. Generated from query-index.json for LLM indexing.',
    '> Posts are sorted newest first.',
    '',
    `Source: ${baseUrl}`,
    `Index: ${baseUrl}/llms.txt`,
    '',
    '---',
    '',
  ];

  if (!entries.length) {
    return [...header, '(No posts found)', ''].join('\n');
  }

  const sections = entries.map((e) => {
    const title = (e.title && typeof e.title === 'string' && e.title.trim())
      ? e.title.trim()
      : e.path.split('/').filter(Boolean).pop() || e.path;
    const absUrl = `${baseUrl}${e.path}`;
    const dateDisplay = getDisplayDate(e);
    const content = (e.content && typeof e.content === 'string') ? e.content.trim() : '';
    const tags = (e.tags && typeof e.tags === 'string')
      ? (() => { try { return JSON.parse(e.tags).join(', '); } catch { return e.tags; } })()
      : '';

    const lines = [`## [${title}](${absUrl})`, ''];
    if (dateDisplay) lines.push(`**Date:** ${dateDisplay}  `);
    if (e.category) lines.push(`**Category:** ${e.category}  `);
    if (tags) lines.push(`**Tags:** ${tags}  `);
    if (e.author) lines.push(`**Author:** ${e.author}  `);
    if (e.description) lines.push('', e.description);
    if (content) lines.push('', content);
    lines.push('', '---', '');
    return lines.join('\n');
  });

  return [...header, ...sections].join('\n');
};

const fetchAllBlogEntries = async (originHostname, siteHostname) => {
  const allData = [];
  const limit = 100;
  let offset = 0;
  let total = Infinity;
  let pages = 0;

  while (offset < total && pages < 5) {
    const originUrl = `https://${originHostname}/query-index.json?limit=${limit}&offset=${offset}`;
    const resp = await fetch(originUrl, {
      headers: {
        'x-forwarded-host': siteHostname,
        'x-byo-cdn-type': 'cloudflare',
      },
    });
    if (!resp.ok) throw new Error(`query-index fetch failed: ${resp.status}`);
    const json = await resp.json();
    total = typeof json.total === 'number' ? json.total : 0;
    const data = Array.isArray(json.data) ? json.data : [];
    allData.push(...data);
    offset += limit;
    pages += 1;
  }

  return allData;
};

const filterAndSortBlogEntries = (allData) => allData
  .filter((e) => {
    if (!e.path || typeof e.path !== 'string') return false;
    if (!e.path.startsWith('/blog/')) return false;
    if (e.path === '/blog/' || e.path === '/blog') return false;
    return true;
  })
  .sort((a, b) => {
    const da = typeof a.date === 'number' ? a.date : Number(a.date) || 0;
    const db = typeof b.date === 'number' ? b.date : Number(b.date) || 0;
    return db - da;
  });

const handleLlmsTxt = async (ctx, originHostname, siteHostname) => {
  const cache = caches.default;
  const cacheKey = getLlmsCacheKey(siteHostname);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let entries = [];
  try {
    const allData = await fetchAllBlogEntries(originHostname, siteHostname);
    entries = filterAndSortBlogEntries(allData);
  } catch (_err) {
    // fallback: empty entries — still return valid llms.txt
  }

  const body = buildLlmsTxt(entries, siteHostname);
  const response = new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400',
    },
  });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};

const handleLlmsFullTxt = async (ctx, originHostname, siteHostname) => {
  const cache = caches.default;
  const cacheKey = getLlmsFullCacheKey(siteHostname);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let entries = [];
  try {
    const allData = await fetchAllBlogEntries(originHostname, siteHostname);
    entries = filterAndSortBlogEntries(allData);
  } catch (_err) {
    // fallback: empty entries
  }

  const body = buildLlmsFullTxt(entries, siteHostname);
  const response = new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400',
    },
  });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};

const fetchBlogFeedEntries = async (ctx, originHostname, siteHostname) => {
  const cache = caches.default;
  const cacheKey = getBlogFeedCacheKey(siteHostname);
  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached.json();
  }

  const allData = await fetchAllBlogEntries(originHostname, siteHostname);
  const filtered = filterAndSortBlogEntries(allData);

  const cacheResp = new Response(JSON.stringify(filtered), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=600',
    },
  });
  ctx.waitUntil(cache.put(cacheKey, cacheResp.clone()));
  return filtered;
};

const buildBlogfeedStaticHtml = (entries) => {
  const displayEntries = entries.slice(0, 20);
  const items = displayEntries.map((e) => {
    const title = escapeHtml(e.title || 'Untitled');
    const desc = sanitizeDescription(e.description || '');
    const dateDisplay = getDisplayDate(e);
    const isoDate = getIsoDate(e);
    const path = (e.path && e.path.startsWith('/')) ? e.path : '#';
    return [
      '<article>',
      `  <h2><a href="${path}">${title}</a></h2>`,
      isoDate ? `  <time datetime="${isoDate}">${escapeHtml(dateDisplay)}</time>` : '',
      desc ? `  <p>${escapeHtml(desc)}</p>` : '',
      '</article>',
    ].filter(Boolean).join('\n');
  }).join('\n');
  return `<aside class="blogfeed-static-fallback">\n${items}\n</aside>`;
};

const buildBlogfeedJsonLd = (entries, siteHostname) => {
  const baseUrl = getLlmsBaseUrl(siteHostname);
  const itemListElement = entries.slice(0, 30).map((e, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    url: `${baseUrl}${e.path}`,
    name: e.title || e.path.split('/').pop(),
    ...(e.description ? { description: sanitizeDescription(e.description) } : {}),
  }));
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Blog Posts',
    numberOfItems: entries.length,
    itemListElement,
  });
};

const applyBlogfeedInjection = (resp, entries, siteHostname) => {
  const staticHtml = buildBlogfeedStaticHtml(entries);
  const jsonLd = buildBlogfeedJsonLd(entries, siteHostname);
  let hasBlogfeed = false;

  return new HTMLRewriter()
    .on('div[data-block-name="blogfeed"]', {
      element(el) {
        hasBlogfeed = true;
        el.prepend(staticHtml, { html: true });
      },
    })
    .on('body', {
      element(el) {
        el.onEndTag((endTag) => {
          if (hasBlogfeed) {
            endTag.before(
              `<script type="application/ld+json">${jsonLd}</script>\n`,
              { html: true },
            );
          }
        });
      },
    })
    .transform(resp);
};

// ---------------------------------------------------------------------------
// ESI helpers
// ---------------------------------------------------------------------------

const DEFAULT_ESI_TIMEOUT_MS = 5000;
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
        currentBlock = {
          id,
          embedPath: '',
          selector: '',
          fallbackMessage: '',
        };
        blocks.push(currentBlock);
        cellIndex = 0;
        keyText = '';
      },
    })
    .on('.esi > div', {
      element() {
        // Finalize previous row before resetting: lock embedPathText once
        // the first embedpath row is complete so a duplicate row doesn't append.
        if (currentBlock && cellIndex > 0) {
          const prevKey = keyText.trim().toLowerCase().replace(/[\s-]/g, '');
          if (prevKey === 'embedpath' && currentBlock.embedPathText) {
            currentBlock.embedPathDone = true;
          }
        }
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
        if (key === 'fallbackmessage') currentBlock.fallbackMessage += text;
        // Capture plain-text URLs; skip if first embedpath row already completed
        if (key === 'embedpath' && !currentBlock.embedPath && !currentBlock.embedPathDone) {
          currentBlock.embedPathText = (currentBlock.embedPathText || '') + text;
        }
      },
    })
    .on('.esi > div > div a', {
      element(el) {
        if (!currentBlock || cellIndex !== 2) return;
        const key = keyText.trim().toLowerCase().replace(/[\s-]/g, '');
        if (key === 'embedpath' && !currentBlock.embedPath) {
          // Hyperlinked value takes priority over plain text
          currentBlock.embedPath = el.getAttribute('href') || '';
        }
      },
    })
    .transform(new Response(html))
    .text();

  blocks.forEach((block) => {
    // eslint-disable-next-line no-param-reassign
    block.selector = block.selector.trim();
    // eslint-disable-next-line no-param-reassign
    block.fallbackMessage = block.fallbackMessage.trim();
    // Prefer <a href> value; fall back to plain-text URL
    if (!block.embedPath && block.embedPathText) {
      // eslint-disable-next-line no-param-reassign
      block.embedPath = block.embedPathText.trim();
    }
  });

  return { blocks, markedHtml };
}

/**
 * Extract a CSS-selector-matched element (or body's inner HTML when no selector
 * is given) from upstream HTML using HTMLRewriter sentinels.
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

  const timeoutMs = Number(env.ESI_TIMEOUT_MS) || DEFAULT_ESI_TIMEOUT_MS;

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

/**
 * Wrap fragment HTML in eds-embed custom element so EDS's decorateBlocks skips it
 * and Shadow DOM provides CSS isolation.
 */
function wrapFragment(fragmentHtml) {
  return `<eds-embed data-esi-injected>${fragmentHtml}</eds-embed>`;
}

const EDS_EMBED_WEB_COMPONENT_SCRIPT = '<script>(()=>{if(customElements.get("eds-embed"))return;customElements.define("eds-embed",class extends HTMLElement{connectedCallback(){if(this.shadowRoot)return;const shadow=this.attachShadow({mode:"open"});while(this.firstChild)shadow.append(this.firstChild);}});})();</script>';

function getCspNonce(headers) {
  const csp = headers.get('content-security-policy') || '';
  const match = csp.match(/'nonce-([^']+)'/);
  return match ? match[1] : '';
}

function buildEdsEmbedScriptTag(nonce) {
  if (!nonce) return EDS_EMBED_WEB_COMPONENT_SCRIPT;
  return `<script nonce="${nonce}">(()=>{if(customElements.get("eds-embed"))return;customElements.define("eds-embed",class extends HTMLElement{connectedCallback(){if(this.shadowRoot)return;const shadow=this.attachShadow({mode:"open"});while(this.firstChild)shadow.append(this.firstChild);}});})();</script>`;
}

/**
 * Phase 2 — replace each marked `.esi` block with its fetched fragment HTML.
 * Blocks whose fetch failed are left in place so the client-side JS fallback
 * in esi.js can still attempt them.
 */
function substituteEsi(markedHtml, blockContents, blockConfigById, headers, status) {
  const cspNonce = getCspNonce(headers);
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
    const scriptTag = buildEdsEmbedScriptTag(cspNonce);
    rewriter = rewriter.on('body', {
      element(el) {
        el.append(scriptTag, { html: true });
      },
    });
  }

  return rewriter.transform(new Response(markedHtml, { status, headers }));
}

// ---------------------------------------------------------------------------
// Main fetch handler
// ---------------------------------------------------------------------------

const handleRequest = async (request, env, ctx) => {
  const url = new URL(request.url);
  const originHostname = env.ORIGIN_HOSTNAME || 'main--helix-project-boilerplate--cantolick.aem.live';
  // Derive public site hostname from env or the incoming Host header.
  // Set SITE_HOSTNAME env var to override (e.g. for staging or other domains).
  const siteHostname = env.SITE_HOSTNAME || url.hostname;

  if (url.pathname === '/llms.txt') {
    return handleLlmsTxt(ctx, originHostname, siteHostname);
  }

  if (url.pathname === '/llms-full.txt') {
    return handleLlmsFullTxt(ctx, originHostname, siteHostname);
  }

  if (url.port) {
    const redirectTo = new URL(request.url);
    redirectTo.port = '';
    return new Response(`Moved permanently to ${redirectTo.href}`, {
      status: 301,
      headers: { location: redirectTo.href },
    });
  }

  if (url.pathname.startsWith('/drafts/')) {
    return new Response('Not Found', { status: 404 });
  }

  if (isRUMRequest(url)) {
    if (!['GET', 'POST', 'OPTIONS'].includes(request.method)) {
      return new Response('Method Not Allowed', { status: 405 });
    }
  }

  const extension = getExtension(url.pathname);
  const isHtmlPageRequest = !extension || extension === 'html';
  const savedSearch = url.search;
  const { searchParams } = url;

  if (isMediaRequest(url)) {
    for (const [key] of searchParams.entries()) {
      if (!['format', 'height', 'optimize', 'width'].includes(key)) {
        searchParams.delete(key);
      }
    }
  } else if (extension === 'json') {
    for (const [key] of searchParams.entries()) {
      if (!['limit', 'offset', 'sheet'].includes(key)) {
        searchParams.delete(key);
      }
    }
  } else {
    url.search = '';
  }
  searchParams.sort();

  url.hostname = originHostname;
  if (!url.origin.match(/^https:\/\/main--.*--.*\.(?:aem|hlx)\.live/)) {
    return new Response('Invalid ORIGIN_HOSTNAME', { status: 500 });
  }

  const req = new Request(url, request);
  req.headers.set('x-forwarded-host', req.headers.get('host'));
  req.headers.set('x-byo-cdn-type', 'cloudflare');
  if (env.PUSH_INVALIDATION !== 'disabled') {
    req.headers.set('x-push-invalidation', 'enabled');
  }
  if (env.ORIGIN_AUTHENTICATION) {
    req.headers.set('authorization', `token ${env.ORIGIN_AUTHENTICATION}`);
  }
  // Workers do not auto-decompress fetch() response bodies. Requesting identity
  // encoding for HTML pages ensures .text() receives plain bytes, not brotli/gzip.
  // Cloudflare's edge re-compresses the Worker's response before sending to browsers,
  // so Lighthouse sees a compressed response regardless.
  if (isHtmlPageRequest) {
    req.headers.set('accept-encoding', 'identity');
  }

  const [fetchedResp, feedEntries] = await Promise.all([
    fetch(req, { method: req.method, cf: { cacheEverything: true } }),
    isHtmlPageRequest
      ? fetchBlogFeedEntries(ctx, originHostname, siteHostname).catch(() => [])
      : Promise.resolve([]),
  ]);

  // Build mutable headers once and apply all mutations upfront.
  const mutHeaders = new Headers(fetchedResp.headers);

  if (fetchedResp.status === 301 && savedSearch) {
    const location = mutHeaders.get('location');
    if (location && !location.match(/\?.*$/)) {
      mutHeaders.set('location', `${location}${savedSearch}`);
    }
  }
  if (fetchedResp.status === 304) {
    mutHeaders.delete('Content-Security-Policy');
  }
  mutHeaders.delete('age');
  mutHeaders.delete('x-robots-tag');

  // HTML 200 — apply blogfeed injection then ESI substitution.
  const isHtmlContent = (mutHeaders.get('content-type') || '').includes('text/html');
  if (isHtmlPageRequest && fetchedResp.status === 200 && isHtmlContent) {
    // Delete encoding/length headers: the Worker re-encodes nothing, so the
    // browser must receive plain text without a stale content-encoding header.
    mutHeaders.delete('content-encoding');
    mutHeaders.delete('content-length');
    let html = await fetchedResp.text();

    // Step 1: blogfeed static HTML + JSON-LD injection
    if (feedEntries.length > 0) {
      html = await applyBlogfeedInjection(
        new Response(html, { headers: { 'content-type': 'text/html' } }),
        feedEntries,
        siteHostname,
      ).text();
    }

    // Step 2: ESI server-side block substitution
    const { blocks, markedHtml } = await markAndCollect(html);
    if (blocks.length > 0) {
      const blockConfigById = new Map(blocks.map((b) => [b.id, b]));
      const esiEntries = await Promise.all(
        blocks.map(async (b) => [b.id, await fetchFragment(b, request.url, env)]),
      );
      const blockContents = new Map(esiEntries);
      return substituteEsi(markedHtml, blockContents, blockConfigById, mutHeaders, fetchedResp.status);
    }

    // No ESI blocks — return blogfeed-processed (or unchanged) HTML
    return new Response(html, { status: fetchedResp.status, headers: mutHeaders });
  }

  // Non-HTML or non-200 — stream body through with mutated headers
  return new Response(fetchedResp.body, { status: fetchedResp.status, headers: mutHeaders });
};

export default {
  fetch: handleRequest,
};
