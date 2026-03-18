/**
 * EDS → AEM Block Migration Tool
 *
 * Reads each AEM page that was migrated and patches its JCR content tree
 * with the block structure parsed from the original EDS .plain.html.
 *
 * EDS block structure:        AEM JCR equivalent:
 * ─────────────────────────   ─────────────────────────────────────────
 * <div class="hero">          section/hero/
 *   <div><div>...</div></div>   sling:resourceType = .../block/v1/block
 * </div>                        name = "Hero"
 *
 * Plain text/headings outside  section/text_N/
 * blocks become text nodes:      sling:resourceType = .../text/v1/text
 *                                text = "<p>...</p>"
 *
 * section-metadata sets:       section/
 *   Style = highlight            style = "highlight"
 *
 * Multiple EDS sections        section, section_0, section_1, ...
 * (separated by <hr> or
 * empty <div>) map to
 * separate AEM section nodes.
 *
 * Usage:
 *   node patch-page-blocks.js
 *
 * Dry run:
 *   node patch-page-blocks.js --dry-run
 *
 * Single page:
 *   node patch-page-blocks.js --page /content/helix-project-boilerplate/index
 */

import 'dotenv/config';
import { parse } from 'node-html-parser';

// ─── Config ────────────────────────────────────────────────────────────────

const EDS_BASE = 'https://main--helix-project-boilerplate--cantolick.aem.page';
const AEM_HOST = process.env.AEM_HOST || 'https://author-p110511-e1076828.adobeaemcloud.com';
const AEM_TOKEN = process.env.AEM_TOKEN || '';
const DRY_RUN = process.argv.includes('--dry-run');

// Single page override: --page /content/helix-project-boilerplate/index
const PAGE_ARG = (() => {
  const i = process.argv.indexOf('--page');
  return i !== -1 ? process.argv[i + 1] : null;
})();

// All pages to patch: aem path → eds source path
const ALL_PAGES = [
  { aemPath: '/content/helix-project-boilerplate/index', edsPath: '/index' },
  { aemPath: '/content/helix-project-boilerplate/about', edsPath: '/about' },
  { aemPath: '/content/helix-project-boilerplate/nav', edsPath: '/nav' },
  { aemPath: '/content/helix-project-boilerplate/footer', edsPath: '/footer' },
  // Blog posts — mostly plain text, no named blocks
  { aemPath: '/content/helix-project-boilerplate/blog/spreadsheet-as-a-service', edsPath: '/blog/spreadsheet-as-a-service' },
  { aemPath: '/content/helix-project-boilerplate/blog/top-3-things-i-learned-when-implementing-edge-delivery', edsPath: '/blog/top-3-things-i-learned-when-implementing-edge-delivery' },
  { aemPath: '/content/helix-project-boilerplate/blog/top-3-things-i-learned-at-imagine-2019', edsPath: '/blog/top-3-things-i-learned-at-imagine-2019' },
  { aemPath: '/content/helix-project-boilerplate/blog/throwback-thursday', edsPath: '/blog/throwback-thursday' },
  { aemPath: '/content/helix-project-boilerplate/blog/screenly', edsPath: '/blog/screenly' },
  { aemPath: '/content/helix-project-boilerplate/blog/process-result', edsPath: '/blog/process-result' },
  { aemPath: '/content/helix-project-boilerplate/blog/vuejs', edsPath: '/blog/vuejs' },
  { aemPath: '/content/helix-project-boilerplate/blog/influential-engineer', edsPath: '/blog/influential-engineer' },
  { aemPath: '/content/helix-project-boilerplate/blog/geb-jeb', edsPath: '/blog/geb-jeb' },
  { aemPath: '/content/helix-project-boilerplate/blog/nfjs-business-pressure', edsPath: '/blog/nfjs-business-pressure' },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function log(msg) { console.log(msg); } // eslint-disable-line no-console

/** Convert a block class name to a display name: "section-metadata" → "Section Metadata" */
function blockDisplayName(cls) {
  return cls.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** Unique node name generator — appends _0, _1 etc when name already used */
function makeNamer() {
  const used = new Set();
  return (base) => {
    if (!used.has(base)) { used.add(base); return base; }
    let i = 0;
    while (used.has(`${base}_${i}`)) i++;
    const name = `${base}_${i}`;
    used.add(name);
    return name;
  };
}

/** Serialize HTML from a node, stripping EDS-specific srcset cruft */
function cleanHtml(node) {
  return node.innerHTML
    .replace(/<source[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── EDS HTML Parser ───────────────────────────────────────────────────────

/**
 * Parse EDS .plain.html into an array of AEM sections.
 *
 * Each section is: { style?: string, nodes: Array<{type, ...}> }
 * Node types:
 *   { type: 'text', html: string }
 *   { type: 'block', blockName: string, displayName: string, rows: Array<string[]> }
 */
function parseEdsHtml(html) {
  const root = parse(html);
  // Top-level <div> elements are EDS sections
  const edsSections = root.querySelectorAll(':scope > div');

  const sections = [];

  for (const sectionEl of edsSections) {
    const section = { style: null, nodes: [] };
    const namer = makeNamer();

    // Collect direct children
    const children = sectionEl.childNodes.filter((n) => n.nodeType === 1); // elements only

    let textAccum = [];

    const flushText = () => {
      const html = textAccum.map((n) => n.outerHTML || '').join('').trim();
      if (html) section.nodes.push({ type: 'text', html, nodeName: namer('text') });
      textAccum = [];
    };

    for (const child of children) {
      const tagName = child.tagName?.toLowerCase();
      const classList = (child.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean);
      const blockClass = classList[0];

      if (blockClass === 'section-metadata') {
        // Extract style value
        const rows = child.querySelectorAll(':scope > div');
        for (const row of rows) {
          const cells = row.querySelectorAll(':scope > div');
          if (cells.length === 2) {
            const key = cells[0].text.trim().toLowerCase();
            const val = cells[1].text.trim().toLowerCase();
            if (key === 'style') section.style = val;
          }
        }
        continue;
      }

      if (blockClass && tagName === 'div') {
        // It's a named block
        flushText();
        const rows = child.querySelectorAll(':scope > div').map((row) => {
          return row.querySelectorAll(':scope > div').map((cell) => cleanHtml(cell));
        });
        section.nodes.push({
          type: 'block',
          blockName: blockClass,
          displayName: blockDisplayName(blockClass),
          // Variant classes (e.g. "cards cards--featured") → extra variants
          variants: classList.slice(1),
          rows,
          nodeName: namer(blockClass.replace(/-/g, '_')),
        });
      } else {
        // Plain content — accumulate
        textAccum.push(child);
      }
    }

    flushText();

    // Only add non-empty sections
    if (section.nodes.length > 0 || section.style) {
      sections.push(section);
    }
  }

  return sections;
}

// ─── JCR Payload Builder ───────────────────────────────────────────────────

/**
 * Build a flat FormData payload for Sling POST that creates/updates
 * the full root/section tree for a page.
 *
 * Sling POST uses dot-notation for nested nodes and relative paths:
 *   ./root/section/hero/sling:resourceType = core/franklin/components/block/v1/block
 */
function buildSlingPayload(sections) {
  const form = new FormData();
  form.append('_charset_', 'utf-8');

  // Root node
  form.append('./root/jcr:primaryType', 'nt:unstructured');
  form.append('./root/sling:resourceType', 'core/franklin/components/root/v1/root');

  const sectionNamer = makeNamer();

  sections.forEach((section) => {
    const sectionKey = sectionNamer('section');
    const sectionBase = `./root/${sectionKey}`;

    form.append(`${sectionBase}/jcr:primaryType`, 'nt:unstructured');
    form.append(`${sectionBase}/sling:resourceType`, 'core/franklin/components/section/v1/section');
    if (section.style) {
      form.append(`${sectionBase}/style`, section.style);
    }

    const nodeNamer = makeNamer();

    for (const node of section.nodes) {
      if (node.type === 'text') {
        const key = nodeNamer('text');
        const base = `${sectionBase}/${key}`;
        form.append(`${base}/jcr:primaryType`, 'nt:unstructured');
        form.append(`${base}/sling:resourceType`, 'core/franklin/components/text/v1/text');
        form.append(`${base}/text`, node.html);
        form.append(`${base}/textIsRich`, 'true');
      } else if (node.type === 'block') {
        const key = nodeNamer(node.blockName.replace(/-/g, '_'));
        const base = `${sectionBase}/${key}`;
        form.append(`${base}/jcr:primaryType`, 'nt:unstructured');
        form.append(`${base}/sling:resourceType`, 'core/franklin/components/block/v1/block');
        form.append(`${base}/name`, node.displayName);

        // For blocks with rows → create child item nodes
        if (node.rows.length > 0) {
          const rowNamer = makeNamer();
          node.rows.forEach((row) => {
            const rowKey = rowNamer('item');
            const rowBase = `${base}/${rowKey}`;
            form.append(`${rowBase}/jcr:primaryType`, 'nt:unstructured');
            form.append(`${rowBase}/sling:resourceType`, 'core/franklin/components/block/v1/block/item');
            form.append(`${rowBase}/name`, 'Item');

            if (row.length === 1) {
              // Single cell → text field
              form.append(`${rowBase}/text`, row[0]);
              form.append(`${rowBase}/textIsRich`, 'true');
            } else {
              // Multi-cell → col0, col1, ...
              row.forEach((cell, i) => {
                form.append(`${rowBase}/col${i}`, cell);
              });
            }
          });
        }
      }
    }
  });

  return form;
}

// ─── AEM Patch ─────────────────────────────────────────────────────────────

async function fetchEdsHtml(edsPath) {
  const url = `${EDS_BASE}${edsPath}.plain.html`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

async function patchPageBlocks(aemPath, sections) {
  const form = buildSlingPayload(sections);

  const res = await fetch(`${AEM_HOST}${aemPath}/jcr:content`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${AEM_TOKEN}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Patch failed ${aemPath}: ${res.status} ${text.slice(0, 300)}`);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function run() {
  if (DRY_RUN) log('=== DRY RUN MODE ===\n');
  else {
    if (!AEM_TOKEN) { log('ERROR: AEM_TOKEN required'); process.exit(1); }
    log(`AEM Host: ${AEM_HOST}\n`);
  }

  const pages = PAGE_ARG
    ? ALL_PAGES.filter((p) => p.aemPath === PAGE_ARG)
    : ALL_PAGES;

  if (PAGE_ARG && pages.length === 0) {
    log(`ERROR: No page found for --page ${PAGE_ARG}`);
    log('Valid paths:', ALL_PAGES.map((p) => p.aemPath).join('\n  '));
    process.exit(1);
  }

  const results = { patched: [], skipped: [], failed: [] };

  for (const { aemPath, edsPath } of pages) {
    log(`Processing: ${edsPath} → ${aemPath}`);
    try {
      const html = await fetchEdsHtml(edsPath);
      const sections = parseEdsHtml(html);

      log(`  Sections: ${sections.length}`);
      sections.forEach((s, i) => {
        const nodeTypes = s.nodes.map((n) => n.type === 'block' ? `[${n.blockName}]` : 'text').join(', ');
        log(`  Section ${i}${s.style ? ` (style: ${s.style})` : ''}: ${nodeTypes || '(empty)'}`);
      });

      if (DRY_RUN) {
        log('  → [DRY RUN] Would patch blocks');
        results.skipped.push(aemPath);
      } else {
        await patchPageBlocks(aemPath, sections);
        log(`  → Patched ✓`);
        results.patched.push(aemPath);
      }
    } catch (err) {
      log(`  → ERROR: ${err.message}`);
      results.failed.push({ path: aemPath, error: err.message });
    }
    log('');
  }

  log('─── Summary ─────────────────────────────────────────');
  log(`  Patched: ${results.patched.length}`);
  log(`  Skipped: ${results.skipped.length}`);
  log(`  Failed:  ${results.failed.length}`);
  if (results.failed.length) {
    log('\nFailed:');
    results.failed.forEach((f) => log(`  - ${f.path}: ${f.error}`));
  }
  log('─────────────────────────────────────────────────────');
}

run().catch((err) => { console.error('Fatal:', err.message); process.exit(1); }); // eslint-disable-line no-console
