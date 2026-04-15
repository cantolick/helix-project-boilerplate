import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const filePath = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(filePath), '..');
const hooksDir = path.join(ROOT, '.githooks');

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const gitDir = path.join(ROOT, '.git');
  const hasGitDir = await exists(gitDir);
  const hasHooksDir = await exists(hooksDir);

  if (!hasGitDir || !hasHooksDir) {
    return;
  }

  await execFileAsync('git', ['config', 'core.hooksPath', '.githooks'], {
    cwd: ROOT,
  });

  process.stdout.write('Git hooks installed from .githooks\n');
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
