import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const testFiles = execFileSync(
  'git',
  [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    ':(glob)**/*.test.ts',
    ':(glob)**/*.test.tsx',
  ],
  { cwd: repoRoot, encoding: 'utf8' }
)
  .split(/\r?\n/)
  .filter(Boolean);

const issues = [];
for (const path of testFiles) {
  let source;
  try {
    source = await readFile(join(repoRoot, path), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') continue;
    throw error;
  }
  const usesPropertyTesting =
    /from\s+['"]fast-check['"]/.test(source) || /\bfc\.assert\s*\(/.test(source);
  if (usesPropertyTesting && !/\.property\.test\.[jt]sx?$/.test(path)) {
    issues.push(
      `${path} uses property testing and must be named <subject>.property.test.ts(x).`
    );
  }
}

if (issues.length) {
  console.error(issues.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Property test file names are valid.');
}
