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

import 'dotenv/config';
import { parse } from 'node-html-parser';

// ─── Config ────────────────────────────────────────────────────────────────

const EDS_BASE = 'https://main--helix-project-boilerplate--cantolick.aem.page';
const QUERY_INDEX = `${EDS_BASE}/query-index.json`;

const AEM_HOST = process.env.AEM_HOST || 'https://author-p110511-e1076828.adobeaemcloud.com';
const AEM_TOKEN = process.env.AEM_TOKEN || '';

// Where Content Fragments will be created in AEM DAM
// Used for Sling POST servlet (full JCR path)
const CF_PARENT_PATH = '/content/dam/helix-project-boilerplate/blog';

// The Content Fragment Model path in AEM (used for reference/docs)
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
 * Parse a loose date string like "August 2025", "Feb 2019", "December 2024"
 * into an ISO 8601 date string (YYYY-MM-DD) expected by the AEM Date field.
 * Defaults to the 1st of the month when no day is present.
 * Returns null if the string cannot be parsed.
 */
function parseDate(raw) {
  if (!raw) return null;
  const cleaned = raw.trim();

  // Already ISO-ish: "2025-08-01"
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) return cleaned.slice(0, 10);

  // "Month YYYY" or "Mon YYYY" — e.g. "August 2025", "Feb 2019"
  const monthYear = cleaned.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (monthYear) {
    const d = new Date(`${monthYear[1]} 1, ${monthYear[2]}`);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  // "Month Day, YYYY" — e.g. "February 14, 2018"
  const full = new Date(cleaned);
  if (!Number.isNaN(full.getTime())) return full.toISOString().slice(0, 10);

  return null;
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
  const dateIso = parseDate(dateRaw);

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
    date: dateIso,
    dateRaw,
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

// ─── AEM Sites OpenAPI ─────────────────────────────────────────────────────

// Model ID retrieved via GET /adobe/sites/cf/models
const CF_MODEL_ID = 'L2NvbmYvaGVsaXgtcHJvamVjdC1ib2lsZXJwbGF0ZS9zZXR0aW5ncy9kYW0vY2ZtL21vZGVscy9ibG9nLXBvc3Q';

function aemHeaders() {
  if (!AEM_TOKEN) throw new Error('AEM_TOKEN environment variable is required.');
  return {
    Authorization: `Bearer ${AEM_TOKEN}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

/**
 * Check if a Content Fragment already exists by searching the Sites API.
 */
async function cfExists(slug) {
  const url = `${AEM_HOST}/adobe/sites/cf/fragments?path=${CF_PARENT_PATH}/${slug}`;
  const res = await fetch(url, { headers: aemHeaders() });
  if (!res.ok) return false;
  const json = await res.json();
  return json.total > 0;
}

/**
 * Create a Content Fragment via the AEM Sites Content Fragments OpenAPI.
 *
 * Field types per model introspection:
 *   title, category, image, sourcePath → type: "text", values: [string]
 *   description, body                  → type: "long-text", values: [string]
 *   date                               → type: "date", values: [string ISO]
 *   tags                               → type: "tag", values: [string[]]  (skipped — requires tag paths)
 */
async function createContentFragment(post) {
  const cfPath = `${CF_PARENT_PATH}/${post.slug}`;
  const url = `${AEM_HOST}/adobe/sites/cf/fragments`;

  const payload = {
    title: post.title,
    parentPath: CF_PARENT_PATH,
    modelId: CF_MODEL_ID,
    fields: [
      { name: 'title', type: 'text', multiple: false, values: [post.title] },
      ...(post.date ? [{ name: 'date', type: 'date', multiple: false, values: [post.date] }] : []),
      { name: 'description', type: 'long-text', multiple: false, values: [post.description] },
      { name: 'category', type: 'text', multiple: false, values: [post.category] },
      { name: 'body', type: 'long-text', multiple: false, values: [post.body] },
      { name: 'image', type: 'text', multiple: false, values: [post.imageUrl] },
      { name: 'sourcePath', type: 'text', multiple: false, values: [post.sourcePath] },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: aemHeaders(),
    body: JSON.stringify(payload),
  });

  const responseText = await res.text();

  if (!res.ok) {
    let detail = responseText.slice(0, 500);
    try {
      const json = JSON.parse(responseText);
      detail = json.detail || JSON.stringify(json.validationStatus) || detail;
    } catch { /* not JSON */ }
    throw new Error(`AEM API ${res.status} for ${cfPath}: ${detail}`);
  }

  return cfPath;
}

/**
 * Ensure the parent folder exists in AEM DAM, create it if not.
 * Uses the Sling POST servlet (multipart/form-data) which is the
 * correct approach for AEM Cloud Service folder creation.
 */
async function ensureFolder(folderPath) {
  // Check via Assets API if folder already exists
  const checkUrl = `${AEM_HOST}/api/assets${folderPath}.json`;
  const checkRes = await fetch(checkUrl, { headers: aemHeaders() });
  if (checkRes.ok) return;

  log(`  Creating DAM folder: ${folderPath}`);

  // Build each segment of the path, creating any missing folders top-down
  const segments = folderPath.replace(/^\/content\/dam/, '').split('/').filter(Boolean);
  let currentPath = '/content/dam';

  for (const segment of segments) {
    currentPath = `${currentPath}/${segment}`;
    const segCheckRes = await fetch(`${AEM_HOST}/api/assets${currentPath.replace('/content/dam', '')}.json`, { headers: aemHeaders() });
    if (segCheckRes.ok) continue;

    // Use Sling POST servlet to create the folder node
    const form = new FormData();
    form.append('_charset_', 'utf-8');
    form.append('./jcr:primaryType', 'sling:Folder');
    form.append('./jcr:title', segment);

    const createRes = await fetch(`${AEM_HOST}${currentPath}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${AEM_TOKEN}` },
      body: form,
    });

    if (!createRes.ok && createRes.status !== 200 && createRes.status !== 201) {
      const text = await createRes.text();
      throw new Error(`Failed to create folder ${currentPath}: ${createRes.status} ${text.slice(0, 200)}`);
    }
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

  // 2. Verify AEM connectivity and token validity
  if (!DRY_RUN) {
    log('Verifying AEM connectivity...');
    const pingUrl = `${AEM_HOST}/api/assets.json`;
    const pingRes = await fetch(pingUrl, { headers: aemHeaders() });
    if (!pingRes.ok) {
      log(`ERROR: AEM API returned ${pingRes.status} — check your AEM_TOKEN and AEM_HOST.`);
      if (pingRes.status === 401) log('  Token may be expired. Get a new one from AEM Developer Console.');
      process.exit(1);
    }
    log('  AEM connection OK.\n');

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
      log(`  Date:     ${post.dateRaw} → ${post.date || 'COULD NOT PARSE'}`);
      log(`  Category: ${post.category}`);
      log(`  Tags:     ${post.tags.join(', ') || '(none)'}`);
      log(`  Image:    ${post.imageUrl || '(none)'}`);
      log(`  Body:     ${post.body.length} chars`);

      if (DRY_RUN) {
        log('  → [DRY RUN] Would create CF at: ' + `${CF_PARENT_PATH}/${post.slug}`);
        results.created.push(post.slug);
      } else {
        // Check if already exists
        const exists = await cfExists(post.slug);
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
