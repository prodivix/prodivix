import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const corePackages = {
  assets: new Set(),
  animation: new Set(['@prodivix/authoring', '@prodivix/runtime-core']),
  router: new Set(['@prodivix/authoring']),
  diagnostics: new Set(),
  authoring: new Set(['@prodivix/diagnostics', '@prodivix/shared']),
  'code-language': new Set(['@prodivix/authoring']),
  tokens: new Set(['@prodivix/authoring']),
  pir: new Set(['@prodivix/authoring', '@prodivix/diagnostics']),
  workspace: new Set([
    '@prodivix/animation',
    '@prodivix/assets',
    '@prodivix/authoring',
    '@prodivix/data',
    '@prodivix/diagnostics',
    '@prodivix/nodegraph',
    '@prodivix/pir',
    '@prodivix/router',
    '@prodivix/server-runtime',
    '@prodivix/shared',
    '@prodivix/tokens',
  ]),
  'workspace-sync': new Set([
    '@prodivix/pir',
    '@prodivix/router',
    '@prodivix/workspace',
  ]),
  'runtime-core': new Set(['@prodivix/diagnostics']),
  'server-runtime': new Set(['@prodivix/authoring', '@prodivix/runtime-core']),
  'runtime-remote': new Set([
    '@prodivix/diagnostics',
    '@prodivix/runtime-core',
    '@prodivix/server-runtime',
  ]),
  'runtime-remote-postgres': new Set([
    '@prodivix/runtime-core',
    '@prodivix/runtime-remote',
  ]),
  data: new Set(['@prodivix/authoring', '@prodivix/runtime-core']),
  nodegraph: new Set(['@prodivix/authoring', '@prodivix/runtime-core']),
};

const forbiddenImports = [
  /^@\//,
  /apps\/web/,
  /^react(?:\/|$)/,
  /^react-dom(?:\/|$)/,
  /^zustand(?:\/|$)/,
  /^@xyflow\/react$/,
  /^@prodivix\/ui$/,
];

const collectSourceFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectSourceFiles(path);
      return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
    })
  );
  return files.flat();
};

const readImports = (source) =>
  [
    ...source.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)(['"])([^'"]+)\1/g),
  ].map((match) => match[2]);

const issues = [];

for (const [packageDirectory, allowedDependencies] of Object.entries(
  corePackages
)) {
  const packageRoot = join(repoRoot, 'packages', packageDirectory);
  const packageJson = JSON.parse(
    await readFile(join(packageRoot, 'package.json'), 'utf8')
  );
  const prodivixDependencies = Object.keys(
    packageJson.dependencies ?? {}
  ).filter((dependency) => dependency.startsWith('@prodivix/'));

  for (const dependency of prodivixDependencies) {
    if (!allowedDependencies.has(dependency)) {
      issues.push(
        `${packageJson.name} has disallowed core dependency ${dependency}.`
      );
    }
  }

  const tsconfig = JSON.parse(
    await readFile(join(packageRoot, 'tsconfig.json'), 'utf8')
  );
  if (JSON.stringify(tsconfig.compilerOptions?.lib) !== '["ES2022"]') {
    issues.push(`${packageJson.name} must compile with lib: ["ES2022"].`);
  }

  for (const file of await collectSourceFiles(join(packageRoot, 'src'))) {
    const source = await readFile(file, 'utf8');
    for (const specifier of readImports(source)) {
      if (forbiddenImports.some((pattern) => pattern.test(specifier))) {
        issues.push(
          `${relative(repoRoot, file)} imports forbidden dependency ${specifier}.`
        );
      }
      if (
        packageDirectory === 'workspace-sync' &&
        specifier.startsWith('@prodivix/pir') &&
        (relative(repoRoot, file).replaceAll('\\', '/') !==
          'packages/workspace-sync/src/workspaceOperationCommitProjection.ts' ||
          specifier !== '@prodivix/pir/wire')
      ) {
        issues.push(
          `${relative(repoRoot, file)} may import @prodivix/pir/wire only from the Atomic Commit wire projector.`
        );
      }
    }
  }
}

if (issues.length) {
  console.error(issues.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Core package boundaries are valid.');
}
