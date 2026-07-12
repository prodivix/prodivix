import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const corePackages = {
  diagnostics: new Set(),
  authoring: new Set(['@prodivix/diagnostics', '@prodivix/shared']),
  pir: new Set(['@prodivix/diagnostics', '@prodivix/shared']),
  workspace: new Set([
    '@prodivix/authoring',
    '@prodivix/pir',
    '@prodivix/shared',
  ]),
  'workspace-sync': new Set(['@prodivix/workspace']),
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
    ...source.matchAll(
      /(?:from\s+|import\s*\(\s*|import\s+)(['"])([^'"]+)\1/g
    ),
  ].map((match) => match[2]);

const issues = [];

for (const [packageDirectory, allowedDependencies] of Object.entries(
  corePackages
)) {
  const packageRoot = join(repoRoot, 'packages', packageDirectory);
  const packageJson = JSON.parse(
    await readFile(join(packageRoot, 'package.json'), 'utf8')
  );
  const prodivixDependencies = Object.keys(packageJson.dependencies ?? {}).filter(
    (dependency) => dependency.startsWith('@prodivix/')
  );

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
    }
  }
}

if (issues.length) {
  console.error(issues.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Core package boundaries are valid.');
}
