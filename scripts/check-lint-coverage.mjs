import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const LINT_SCRIPT = 'eslint .';
const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]sx?)$/;
const BUILD_OUTPUT = /(?:^|\/)(?:dist|build|lib|esm|cjs|out|coverage)\//;

const trackedFiles = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard'],
  { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
)
  .split(/\r?\n/)
  .filter(Boolean);

const sourceOwners = new Set();
const manifests = new Set();
for (const path of trackedFiles) {
  const workspaceMatch = /^((?:apps|packages)\/[^/]+)\/(.+)$/.exec(path);
  if (!workspaceMatch) continue;
  const [, workspace, remainder] = workspaceMatch;
  if (remainder === 'package.json') manifests.add(workspace);
  if (BUILD_OUTPUT.test(`${remainder}/`)) continue;
  if (SOURCE_EXTENSIONS.test(remainder)) sourceOwners.add(workspace);
}

const issues = [];
const rootManifest = JSON.parse(
  await readFile(join(repoRoot, 'package.json'), 'utf8')
);
if (!rootManifest.scripts?.lint?.startsWith(LINT_SCRIPT)) {
  issues.push(
    `package.json: the root lint gate must start with "${LINT_SCRIPT}" so no workspace can be skipped.`
  );
}

for (const workspace of [...sourceOwners].sort()) {
  if (!manifests.has(workspace)) {
    issues.push(`${workspace}: ships source files without a package.json.`);
    continue;
  }
  const manifest = JSON.parse(
    await readFile(join(repoRoot, workspace, 'package.json'), 'utf8')
  );
  if (manifest.scripts?.lint !== LINT_SCRIPT) {
    issues.push(
      `${workspace}/package.json: must declare "lint": "${LINT_SCRIPT}" so the per-package gate covers it.`
    );
  }
}

if (issues.length) {
  console.error(issues.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Lint coverage is complete across ${sourceOwners.size} workspace packages.`
  );
}
