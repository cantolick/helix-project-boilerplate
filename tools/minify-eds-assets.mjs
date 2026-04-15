import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync } from 'node:zlib';
// eslint-disable-next-line import/no-extraneous-dependencies
import { transform as transformCss } from 'lightningcss';
// eslint-disable-next-line import/no-extraneous-dependencies
import { minify as minifyJsSource } from 'terser';

const filePath = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(filePath), '..');
const TODAY = new Date().toISOString().slice(0, 10);

const MANAGED_FILES = [
  ...[
    'blogfeed',
    'cards',
    'code',
    'columns',
    'entry',
    'experience',
    'footer',
    'fragment',
    'header',
    'hero',
    'map',
    'reading-time',
    'related-posts',
    'skills',
  ].flatMap((blockName) => ([
    {
      id: `${blockName}-script`,
      type: 'js',
      block: blockName,
      source: `blocks/${blockName}/${blockName}.src.js`,
      output: `blocks/${blockName}/${blockName}.js`,
      description: `${blockName} block behavior.`,
    },
    {
      id: `${blockName}-styles`,
      type: 'css',
      block: blockName,
      source: `blocks/${blockName}/${blockName}.src.css`,
      output: `blocks/${blockName}/${blockName}.css`,
      description: `${blockName} block styles.`,
    },
  ])),
];

const MANIFEST_PATH = path.join(ROOT, 'agent-manifest.json');
const DEFAULT_BUDGETS = {
  js: 700,
  css: 500,
};
const BUDGET_OVERRIDES = {
  'blocks/blogfeed/blogfeed.js': 1600,
  'blocks/blogfeed/blogfeed.css': 1100,
  'blocks/code/code.js': 700,
  'blocks/header/header.js': 900,
  'blocks/header/header.css': 950,
  'blocks/map/map.js': 2300,
  'blocks/map/map.css': 850,
  'blocks/related-posts/related-posts.js': 950,
};

function toAbsolute(relPath) {
  return path.join(ROOT, relPath);
}

async function minifyJs(source) {
  if (!source.trim()) {
    return '';
  }

  const result = await minifyJsSource(source, {
    module: true,
    compress: {
      defaults: true,
      passes: 2,
    },
    mangle: true,
    format: {
      comments: /^!|@license|@preserve/i,
    },
  });

  if (typeof result.code !== 'string') {
    throw new Error('Terser returned no output for a managed block script.');
  }

  return result.code.trim();
}

function minifyCss(source, filename) {
  const result = transformCss({
    filename,
    code: Buffer.from(source),
    minify: true,
    sourceMap: false,
  });

  return result.code.toString().trim();
}

async function generateOutput(entry, source) {
  if (entry.type === 'js') {
    return minifyJs(source);
  }

  return minifyCss(source, entry.output);
}

function getCompressedSizes(content) {
  const buffer = Buffer.from(content);

  return {
    raw: buffer.length,
    gzip: gzipSync(buffer, { level: 9 }).length,
    brotli: brotliCompressSync(buffer).length,
  };
}

function formatBytes(size) {
  return size.toString().padStart(6, ' ');
}

function createReportLine(entry, sizes) {
  return [
    entry.output.padEnd(40, ' '),
    formatBytes(sizes.raw),
    formatBytes(sizes.gzip),
    formatBytes(sizes.brotli),
  ].join('  ');
}

function getBudget(entry) {
  return BUDGET_OVERRIDES[entry.output] || DEFAULT_BUDGETS[entry.type];
}

async function ensureSourceFile(entry) {
  const sourcePath = toAbsolute(entry.source);
  const outputPath = toAbsolute(entry.output);

  try {
    await fs.access(sourcePath);
  } catch {
    const existingOutput = await fs.readFile(outputPath, 'utf8');
    await fs.writeFile(sourcePath, existingOutput);
  }
}

async function syncEntry(entry, mode) {
  await ensureSourceFile(entry);

  const sourcePath = toAbsolute(entry.source);
  const outputPath = toAbsolute(entry.output);
  const source = await fs.readFile(sourcePath, 'utf8');
  const nextOutput = await generateOutput(entry, source);

  try {
    const currentOutput = await fs.readFile(outputPath, 'utf8');
    if (mode === 'check' && currentOutput !== nextOutput) {
      return { ...entry, status: 'out-of-sync' };
    }
  } catch {
    if (mode === 'check') {
      return { ...entry, status: 'missing-output' };
    }
  }

  if (mode === 'sync') {
    await fs.writeFile(outputPath, nextOutput);
  }

  return { ...entry, status: 'ok', lastMinified: TODAY };
}

async function writeManifest(entries) {
  const manifest = {
    version: '1.0',
    description: 'Agent-only registry for EDS source/output file pairs. Do not deploy.',
    lastUpdated: TODAY,
    updatedBy: 'agent',
    files: entries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      block: entry.block,
      source: entry.source,
      output: entry.output,
      description: entry.description,
      lastMinified: entry.lastMinified || TODAY,
    })),
  };

  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function reportEntries() {
  const results = await Promise.all(MANAGED_FILES.map(async (entry) => {
    await ensureSourceFile(entry);
    const sourcePath = toAbsolute(entry.source);
    const source = await fs.readFile(sourcePath, 'utf8');
    const output = await generateOutput(entry, source);

    return {
      entry,
      sizes: getCompressedSizes(output),
    };
  }));

  process.stdout.write('Output file                                 raw    gzip  brotli\n');
  results.forEach(({ entry, sizes }) => {
    process.stdout.write(`${createReportLine(entry, sizes)}\n`);
  });
}

async function checkBudgets() {
  const results = await Promise.all(MANAGED_FILES.map(async (entry) => {
    await ensureSourceFile(entry);
    const sourcePath = toAbsolute(entry.source);
    const source = await fs.readFile(sourcePath, 'utf8');
    const output = await generateOutput(entry, source);

    return {
      entry,
      sizes: getCompressedSizes(output),
      budget: getBudget(entry),
    };
  }));

  const failures = results.filter(({ sizes, budget }) => sizes.brotli > budget);

  process.stdout.write('Block brotli budgets\n');
  results.forEach(({ entry, sizes, budget }) => {
    const status = sizes.brotli > budget ? 'FAIL' : 'PASS';
    process.stdout.write(
      `${status.padEnd(4, ' ')}  ${entry.output.padEnd(40, ' ')}  ${formatBytes(sizes.brotli)} / ${formatBytes(budget)}\n`,
    );
  });

  if (failures.length) {
    process.stderr.write('\nBudget failures detected:\n');
    failures.forEach(({ entry, sizes, budget }) => {
      process.stderr.write(`- ${entry.output}: brotli ${sizes.brotli} exceeds budget ${budget}\n`);
    });
    process.exit(1);
  }
}

async function main() {
  const mode = process.argv[2] || 'sync';

  if (!['sync', 'check', 'report', 'budget'].includes(mode)) {
    process.stderr.write('Usage: node tools/minify-eds-assets.mjs [sync|check|report|budget]\n');
    process.exit(1);
  }

  if (mode === 'report') {
    await reportEntries();
    return;
  }

  if (mode === 'budget') {
    await checkBudgets();
    return;
  }

  const results = await Promise.all(MANAGED_FILES.map((entry) => syncEntry(entry, mode)));

  if (mode === 'check') {
    const mismatches = results.filter((entry) => entry.status !== 'ok');
    if (mismatches.length) {
      process.stderr.write('Out of sync files detected:\n');
      mismatches.forEach((entry) => {
        process.stderr.write(`- ${entry.output} (${entry.status})\n`);
      });
      process.exit(1);
    }

    process.stdout.write(`Checked ${results.length} managed files: all in sync.\n`);
    return;
  }

  await writeManifest(results);
  process.stdout.write(`Synced ${results.length} managed files.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
