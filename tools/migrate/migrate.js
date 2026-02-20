/**
 * EDS → AEM Content Fragment Migration Tool
 *
 * Fetches blog posts from the live EDS site and creates
 * Content Fragments in AEM via the Assets HTTP API.
 *
 * Usage:
 *   AEM_HOST=https://author-p110511-e1076828.adobeaemcloud.com \
 *   AEM_TOKEN=<your-dev-token> \
 *   node migrate.js
 *
 * Dry run (no writes to AEM):
 *   node migrate.js --dry-run
 */

import { parse } from 'node-html-parser';

// ─── Config ────────────────────────────────────────────────────────────────

const EDS_BASE = 'https://main--helix-project-boilerplate--cantolick.aem.page';
const QUERY_INDEX = `${EDS_BASE}/query-index.json`;

const AEM_HOST = process.env.AEM_HOST || 'https://author-p110511-e1076828.adobeaemcloud.com';
const AEM_TOKEN = process.env.AEM_TOKEN || '';

// Where Content Fragments will be created in AEM DAM
const CF_PARENT_PATH = '/content/dam/helix-project-boilerplate/blog';

// The Content Fragment Model path in AEM
// Update this after creating the model in AEM Author:
// Tools → Assets → Content Fragment Models → your model
const CF_MODEL_PATH = '/conf/helix-project-boilerplate/settings/dam/cfm/models/blog-post';

const DRY_RUN = process.argv.includes('--dry-run');

// ─── Helpers ───────────────────────────────────────────────────────────────

function log(msg) {
  // eslint-disable-next-line no-console
  console.log(msg);
}

function slugify(path) {
  return path.split('/').pop();
}

/**
 * Parse the .plain.html of a blog post into structured fields.
 * Structure observed:
 *   <div>
 *     <h1|h2> title </h1|h2>
 *     <h4> date </h4>
 *     <p>...</p>  ← body paragraphs and images
 *   </div>
 */
function parsePost(html, meta) {
  const root = parse(html);
  const container = root.querySelector('div');

  // Title — prefer h1, fall back to h2
  const titleEl = container.querySelector('h1') || container.querySelector('h2');
  const title = titleEl ? titleEl.text.trim() : meta.title;

  // Date — h4 element
  const dateEl = container.querySelector('h4');
  const dateRaw = dateEl ? dateEl.text.trim() : meta.lastModified;

  // Remove title and date elements so remaining content is the body
  if (titleEl) titleEl.remove();
  if (dateEl) dateEl.remove();

  // Body — everything remaining as HTML, stripped of EDS media srcsets
  // Keep only the <img> src for the featured image reference
  const bodyHtml = container.innerHTML
    .replace(/<source[^>]*>/g, '') // remove <source> tags (EDS-specific)
    .replace(/\s+/g, ' ')
    .trim();

  // Featured image — first img src in the post
  const firstImg = container.querySelector('img');
  const imageUrl = firstImg
    ? `${EDS_BASE}${firstImg.getAttribute('src').replace(/^\.\//, '/blog/')}`
    : meta.image
      ? `${EDS_BASE}${meta.image.replace(/^\.\//, '/blog/')}`
      : '';

  return {
    title,
    date: dateRaw,
    description: meta.description || '',
    category: meta.category || '',
    tags: meta.tag ? meta.tag.split(',').map((t) => t.trim()).filter(Boolean) : [],
    body: bodyHtml,
    imageUrl,
    slug: slugify(meta.path),
    sourcePath: meta.path,
  };
}

/**
 * Fetch all posts from the query index.
 */
async function fetchIndex() {
  log('Fetching content index...');
  const res = await fetch(QUERY_INDEX);
  if (!res.ok) throw new Error(`Failed to fetch index: ${res.status}`);
  const json = await res.json();
  log(`Found ${json.total} posts.\n`);
  return json.data;
}

/**
 * Fetch the full HTML content of a single blog post.
 */
async function fetchPost(path) {
  const url = `${EDS_BASE}${path}.plain.html`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

// ─── AEM API ───────────────────────────────────────────────────────────────

function aemHeaders() {
  if (!AEM_TOKEN) throw new Error('AEM_TOKEN environment variable is required.');
  return {
    Authorization: `Bearer ${AEM_TOKEN}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

/**
 * Check if a Content Fragment already exists at the given path.
 */
async function cfExists(cfPath) {
  const url = `${AEM_HOST}/api/assets${cfPath}.json`;
  const res = await fetch(url, { headers: aemHeaders() });
  return res.ok;
}

/**
 * Create a Content Fragment in AEM via the Assets HTTP API.
 *
 * POST /api/assets/<parent-path>/
 * with the CF payload.
 *
 * AEM CF API reference:
 * https://experienceleague.adobe.com/docs/experience-manager-65/assets/extending/assets-api-content-fragments.html
 */
async function createContentFragment(post) {
  const cfPath = `${CF_PARENT_PATH}/${post.slug}`;
  const url = `${AEM_HOST}/api/assets${CF_PARENT_PATH}/`;

  const payload = {
    class: 'asset',
    properties: {
      'jcr:title': post.title,
      'cq:model': CF_MODEL_PATH,
      elements: {
        title: {
          ':type': 'string',
          value: post.title,
        },
        date: {
          ':type': 'string',
          value: post.date,
        },
        description: {
          ':type': 'string',
          value: post.description,
        },
        category: {
          ':type': 'string',
          value: post.category,
        },
        tags: {
          ':type': 'string[]',
          value: post.tags,
        },
        body: {
          ':type': 'text/html',
          value: post.body,
        },
        image: {
          ':type': 'string',
          value: post.imageUrl,
        },
        sourcePath: {
          ':type': 'string',
          value: post.sourcePath,
        },
      },
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: aemHeaders(),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AEM API error ${res.status} for ${cfPath}: ${text}`);
  }

  return cfPath;
}

/**
 * Ensure the parent folder exists in AEM DAM, create it if not.
 */
async function ensureFolder(folderPath) {
  const url = `${AEM_HOST}/api/assets${folderPath}`;
  const checkRes = await fetch(url, { headers: aemHeaders() });
  if (checkRes.ok) return;

  log(`  Creating DAM folder: ${folderPath}`);
  const createRes = await fetch(url, {
    method: 'POST',
    headers: { ...aemHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      class: 'assetFolder',
      properties: { 'jcr:title': 'Blog' },
    }),
  });
  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Failed to create folder ${folderPath}: ${createRes.status} ${text}`);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function run() {
  if (DRY_RUN) {
    log('=== DRY RUN MODE — no changes will be made to AEM ===\n');
  } else {
    if (!AEM_TOKEN) {
      log('ERROR: AEM_TOKEN environment variable is required.');
      log('Get a token from: AEM Developer Console → Integrations → Local development token');
      process.exit(1);
    }
    log(`AEM Host: ${AEM_HOST}`);
    log(`CF Parent: ${CF_PARENT_PATH}`);
    log(`CF Model:  ${CF_MODEL_PATH}\n`);
  }

  // 1. Fetch index
  const posts = await fetchIndex();

  // 2. Ensure parent folder exists (skip in dry run)
  if (!DRY_RUN) {
    await ensureFolder(CF_PARENT_PATH);
  }

  const results = { created: [], skipped: [], failed: [] };

  // 3. Process each post
  for (const meta of posts) {
    log(`Processing: ${meta.path}`);

    try {
      // Fetch full HTML
      const html = await fetchPost(meta.path);

      // Parse into structured fields
      const post = parsePost(html, meta);

      log(`  Title:    ${post.title}`);
      log(`  Date:     ${post.date}`);
      log(`  Category: ${post.category}`);
      log(`  Tags:     ${post.tags.join(', ') || '(none)'}`);
      log(`  Image:    ${post.imageUrl || '(none)'}`);
      log(`  Body:     ${post.body.length} chars`);

      if (DRY_RUN) {
        log('  → [DRY RUN] Would create CF at: ' + `${CF_PARENT_PATH}/${post.slug}`);
        results.created.push(post.slug);
      } else {
        // Check if already exists
        const exists = await cfExists(`${CF_PARENT_PATH}/${post.slug}`);
        if (exists) {
          log(`  → Skipped (already exists)`);
          results.skipped.push(post.slug);
        } else {
          const cfPath = await createContentFragment(post);
          log(`  → Created: ${cfPath}`);
          results.created.push(post.slug);
        }
      }
    } catch (err) {
      log(`  → ERROR: ${err.message}`);
      results.failed.push({ slug: slugify(meta.path), error: err.message });
    }

    log('');
  }

  // 4. Summary
  log('─── Migration Summary ───────────────────────────────');
  log(`  Created:  ${results.created.length}`);
  log(`  Skipped:  ${results.skipped.length} (already existed)`);
  log(`  Failed:   ${results.failed.length}`);
  if (results.failed.length) {
    log('\nFailed posts:');
    results.failed.forEach((f) => log(`  - ${f.slug}: ${f.error}`));
  }
  log('─────────────────────────────────────────────────────');
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error:', err.message);
  process.exit(1);
});
