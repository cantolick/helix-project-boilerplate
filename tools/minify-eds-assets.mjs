import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// eslint-disable-next-line import/no-extraneous-dependencies
import { tokenizer } from 'acorn';

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
const JS_KEYWORDS_REQUIRING_SPACE = new Set([
  'break',
  'case',
  'continue',
  'delete',
  'do',
  'else',
  'in',
  'instanceof',
  'new',
  'of',
  'return',
  'throw',
  'typeof',
  'void',
  'yield',
]);

function toAbsolute(relPath) {
  return path.join(ROOT, relPath);
}

function needsKeywordSeparator(previous, current) {
  return JS_KEYWORDS_REQUIRING_SPACE.has(previous.value)
    && /^[A-Za-z0-9_$"'`/[{(+-]/.test(current.raw);
}

function needsTokenSeparator(previous, current) {
  if (!previous) return false;
  if (needsKeywordSeparator(previous, current)) return true;

  const prevRaw = previous.raw;
  const currentRaw = current.raw;
  const prevEnd = prevRaw.slice(-1);
  const currentStart = currentRaw[0];

  if (/[A-Za-z0-9_$#]/.test(prevEnd) && /[A-Za-z0-9_$#]/.test(currentStart)) {
    return true;
  }

  if ((prevEnd === '+' && currentStart === '+')
    || (prevEnd === '-' && currentStart === '-')
    || (prevEnd === '/' && currentStart === '/')) {
    return true;
  }

  return false;
}

function getJsLicenseComments(source) {
  const comments = [];
  tokenizer(source, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    onComment: (block, text) => {
      const comment = block ? `/*${text}*/` : `//${text}`;
      if (comment.startsWith('/*!')) comments.push(comment.trim());
    },
  });
  return comments;
}

function minifyJs(source) {
  const comments = getJsLicenseComments(source);
  const tokens = [];
  const tokenStream = tokenizer(source, {
    ecmaVersion: 'latest',
    sourceType: 'module',
  });

  for (let token = tokenStream.getToken(); token.type.label !== 'eof'; token = tokenStream.getToken()) {
    tokens.push({
      raw: source.slice(token.start, token.end),
      start: token.start,
      end: token.end,
      value: token.value,
    });
  }

  let output = comments.length ? `${comments.join('\n')}\n` : '';
  let previous = null;

  tokens.forEach((token) => {
    const between = previous ? source.slice(previous.end, token.start) : '';
    const hadLineBreak = /\r|\n/.test(between);

    if (previous && hadLineBreak && ['return', 'throw', 'break', 'continue'].includes(previous.value)) {
      output += ';';
    } else if (needsTokenSeparator(previous, token)) {
      output += ' ';
    }

    output += token.raw;
    previous = token;
  });

  return output
    .replace(/;;+/g, ';')
    .trim();
}

function minifyCss(source) {
  const licenseComments = [];
  let working = source.replace(/\/\*!([\s\S]*?)\*\//g, (match) => {
    licenseComments.push(match.trim());
    return '';
  });

  working = working.replace(/\/\*[\s\S]*?\*\//g, '');
  working = working.replace(/\s+/g, ' ');
  working = working.replace(/\s*([{};:,>+~])\s*/g, '$1');
  working = working.replace(/;}/g, '}');
  working = working.replace(/@media\(/g, '@media(');
  working = working.replace(/\s*\)\s*/g, ')');
  working = working.replace(/\s*\(\s*/g, '(');
  working = working.trim();

  if (licenseComments.length) {
    return `${licenseComments.join('\n')}\n${working}`.trim();
  }

  return working;
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
  const nextOutput = entry.type === 'js' ? minifyJs(source) : minifyCss(source);

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

async function main() {
  const mode = process.argv[2] || 'sync';

  if (!['sync', 'check'].includes(mode)) {
    process.stderr.write('Usage: node tools/minify-eds-assets.mjs [sync|check]\n');
    process.exit(1);
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
