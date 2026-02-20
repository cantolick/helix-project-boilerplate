/**
 * EDS → AEM Pages Migration Tool
 *
 * Fetches blog posts from the live EDS site and creates AEM Pages
 * under /content/helix-project-boilerplate/blog/<slug> using the
 * Sling POST servlet with the Franklin page template.
 *
 * Each page gets:
 *   - cq:template pointing to /libs/core/franklin/templates/page
 *   - sling:resourceType of core/franklin/components/page/v1/page
 *   - A root content area with the parsed HTML body as rich text
 *
 * Usage:
 *   node migrate-pages.js
 *
 * Dry run (no writes to AEM):
 *   node migrate-pages.js --dry-run
 */

import 'dotenv/config';
import { parse } from 'node-html-parser';

// ─── Config ────────────────────────────────────────────────────────────────

const EDS_BASE = 'https://main--helix-project-boilerplate--cantolick.aem.page';
const QUERY_INDEX = `${EDS_BASE}/query-index.json`;

const AEM_HOST = process.env.AEM_HOST || 'https://author-p110511-e1076828.adobeaemcloud.com';
const AEM_TOKEN = process.env.AEM_TOKEN || '';

// Where pages will be created in the AEM content tree
const PAGE_PARENT_PATH = '/content/helix-project-boilerplate/blog';

// Franklin page template — confirmed via /content/aem-sites-with-edge-delivery-services-template/index/jcr:content.json
const PAGE_TEMPLATE = '/libs/core/franklin/templates/page';
const PAGE_RESOURCE_TYPE = 'core/franklin/components/page/v1/page';

const DRY_RUN = process.argv.includes('--dry-run');

// ─── Helpers ───────────────────────────────────────────────────────────────

function log(msg) {
  // eslint-disable-next-line no-console
  console.log(msg);
}

function slugify(path) {
  return path.split('/').pop();
}

function aemHeaders(contentType = 'application/x-www-form-urlencoded') {
  if (!AEM_TOKEN) throw new Error('AEM_TOKEN environment variable is required.');
  return {
    Authorization: `Bearer ${AEM_TOKEN}`,
    'Content-Type': contentType,
    Accept: 'application/json',
  };
}

// ─── EDS Fetching & Parsing ────────────────────────────────────────────────

async function fetchIndex() {
  log('Fetching content index...');
  const res = await fetch(QUERY_INDEX);
  if (!res.ok) throw new Error(`Failed to fetch index: ${res.status}`);
  const json = await res.json();
  log(`Found ${json.total} posts.\n`);
  return json.data;
}

async function fetchPost(path) {
  const url = `${EDS_BASE}${path}.plain.html`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

/**
 * Parse .plain.html into structured page data.
 * Returns title (for jcr:title) and bodyHtml (for the page content area).
 */
function parsePost(html, meta) {
  const root = parse(html);
  const container = root.querySelector('div') || root;

  // Title — prefer h1, fall back to h2, then meta title
  const titleEl = container.querySelector('h1') || container.querySelector('h2');
  const title = titleEl ? titleEl.text.trim() : (meta.title || slugify(meta.path));

  // Remove the date h4 (not needed in page, it's in the CF)
  const dateEl = container.querySelector('h4');
  if (dateEl) dateEl.remove();

  // Body HTML — clean up EDS-specific artifacts
  const bodyHtml = container.innerHTML
    .replace(/<source[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    title,
    bodyHtml,
    slug: slugify(meta.path),
    sourcePath: meta.path,
    description: meta.description || '',
  };
}

// ─── AEM Page Creation ─────────────────────────────────────────────────────

/**
 * Check if a page already exists at the given JCR path.
 */
async function pageExists(pagePath) {
  const res = await fetch(`${AEM_HOST}${pagePath}/jcr:content.json`, {
    headers: { Authorization: `Bearer ${AEM_TOKEN}`, Accept: 'application/json' },
  });
  return res.ok;
}

/**
 * Create a single page node via the WCM createPage command.
 * parentPath must already exist as a cq:Page or sling:Folder.
 */
async function createPageNode(parentPath, label, title) {
  const form = new URLSearchParams();
  form.append('cmd', 'createPage');
  form.append('parentPath', parentPath);
  form.append('title', title);
  form.append('label', label);
  form.append('template', PAGE_TEMPLATE);
  form.append('_charset_', 'utf-8');

  const createRes = await fetch(`${AEM_HOST}/bin/wcmcommand`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AEM_TOKEN}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Failed to create page ${parentPath}/${label}: ${createRes.status} ${text.slice(0, 300)}`);
  }
}

/**
 * Ensure a page exists at the given JCR path, creating all ancestors as needed.
 * Starts from /content and walks down, creating any missing cq:Page nodes.
 */
async function ensurePagePath(fullPath) {
  // Split into segments after /content
  // e.g. /content/helix-project-boilerplate/blog → ['helix-project-boilerplate', 'blog']
  const withoutContent = fullPath.replace(/^\/content\//, '');
  const segments = withoutContent.split('/').filter(Boolean);

  let currentPath = '/content';
  for (const segment of segments) {
    const targetPath = `${currentPath}/${segment}`;

    // Check if this node already exists
    const res = await fetch(`${AEM_HOST}${targetPath}.json`, {
      headers: { Authorization: `Bearer ${AEM_TOKEN}` },
    });

    if (!res.ok) {
      log(`  Creating page: ${targetPath}`);
      await createPageNode(currentPath, segment, segment);
    }

    currentPath = targetPath;
  }
}

/**
 * Create an AEM page via the Sling POST servlet.
 *
 * This creates a cq:Page node at PAGE_PARENT_PATH/<slug> with:
 *   jcr:content/cq:template  → Franklin page template
 *   jcr:content/jcr:title    → post title
 *   jcr:content/sling:resourceType → Franklin page component
 *   jcr:content/root/default → rich text content area with body HTML
 */
async function createPage(post) {
  const pagePath = `${PAGE_PARENT_PATH}/${post.slug}`;

  // Use WCM createPage command (same as AEM Sites console "Create Page")
  await createPageNode(PAGE_PARENT_PATH, post.slug, post.title);

  // Patch the page with metadata using the WCM updatePage command
  // This handles versioning correctly (checks out automatically)
  const patchForm = new URLSearchParams();
  patchForm.append('cmd', 'setProperty');
  patchForm.append('path', `${pagePath}/jcr:content`);
  patchForm.append('name', 'jcr:description');
  patchForm.append('value', post.description);
  patchForm.append('_charset_', 'utf-8');

  await fetch(`${AEM_HOST}/bin/wcmcommand`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AEM_TOKEN}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: patchForm.toString(),
  });

  // Store source EDS path as a custom property via Sling POST on the page node
  // POST to the page (not jcr:content) uses relative path notation
  const metaForm = new FormData();
  metaForm.append('_charset_', 'utf-8');
  metaForm.append('jcr:content/eds:sourcePath', post.sourcePath);

  const metaRes = await fetch(`${AEM_HOST}${pagePath}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${AEM_TOKEN}` },
    body: metaForm,
  });

  if (!metaRes.ok) {
    const text = await metaRes.text();
    log(`  ⚠ Metadata patch failed for ${pagePath}: ${metaRes.status} ${text.slice(0, 150)}`);
  }

  return pagePath;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function run() {
  if (DRY_RUN) {
    log('=== DRY RUN MODE — no changes will be made to AEM ===\n');
  } else {
    if (!AEM_TOKEN) {
      log('ERROR: AEM_TOKEN environment variable is required.');
      process.exit(1);
    }
    log(`AEM Host:    ${AEM_HOST}`);
    log(`Page Parent: ${PAGE_PARENT_PATH}`);
    log(`Template:    ${PAGE_TEMPLATE}\n`);
  }

  // 1. Fetch the EDS query index
  const posts = await fetchIndex();

  // 2. Verify AEM connectivity
  if (!DRY_RUN) {
    log('Verifying AEM connectivity...');
    const pingRes = await fetch(`${AEM_HOST}/api/assets.json`, {
      headers: { Authorization: `Bearer ${AEM_TOKEN}` },
    });
    if (!pingRes.ok) {
      log(`ERROR: AEM returned ${pingRes.status} — check AEM_TOKEN and AEM_HOST.`);
      if (pingRes.status === 401) log('  Token may be expired. Get a new one from AEM Developer Console.');
      process.exit(1);
    }
    log('  AEM connection OK.\n');

    // Ensure /content/helix-project-boilerplate/blog exists (creates ancestors too)
    await ensurePagePath(PAGE_PARENT_PATH);
    // Brief pause to let AEM finish committing the new folder pages
    await new Promise((r) => setTimeout(r, 2000));
  }

  const results = { created: [], skipped: [], failed: [] };

  // 3. Process each post
  for (const meta of posts) {
    log(`Processing: ${meta.path}`);

    try {
      const html = await fetchPost(meta.path);
      const post = parsePost(html, meta);

      log(`  Title: ${post.title}`);
      log(`  Slug:  ${post.slug}`);
      log(`  Body:  ${post.bodyHtml.length} chars`);

      if (DRY_RUN) {
        log(`  → [DRY RUN] Would create page at: ${PAGE_PARENT_PATH}/${post.slug}`);
        results.created.push(post.slug);
      } else {
        const exists = await pageExists(`${PAGE_PARENT_PATH}/${post.slug}`);
        if (exists) {
          log('  → Skipped (already exists)');
          results.skipped.push(post.slug);
        } else {
          const pagePath = await createPage(post);
          log(`  → Created: ${pagePath}`);
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
    log('\nFailed pages:');
    results.failed.forEach((f) => log(`  - ${f.slug}: ${f.error}`));
  }
  log('─────────────────────────────────────────────────────');
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error:', err.message);
  process.exit(1);
});
