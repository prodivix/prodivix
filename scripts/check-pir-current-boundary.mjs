import { spawnSync } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const sourceParents = ['apps', 'packages'];
const sourceExtensions = /\.(?:[cm]?[jt]sx?)$/;
const skippedDirectories = new Set([
  'coverage',
  'dist',
  'node_modules',
  'storybook-static',
]);

const pirCodecRoot = join(repoRoot, 'packages/pir/src/codec');
const pirWireEntry = join(repoRoot, 'packages/pir/src/wire.ts');
const generatedWirePath = join(pirCodecRoot, 'pirWire.generated.ts');
const workspaceCommitWireProjector = join(
  repoRoot,
  'packages/workspace-sync/src/workspaceOperationCommitPirWire.ts'
);
const legacyGeneratedWirePath = join(
  repoRoot,
  'packages/shared/src/types/pir.generated.ts'
);

const isInside = (path, root) =>
  path === root || path.startsWith(`${root}${sep}`);
const isWireBoundary = (path) =>
  isInside(path, pirCodecRoot) ||
  path === pirWireEntry ||
  path === workspaceCommitWireProjector;
const toRepositoryPath = (path) =>
  relative(repoRoot, path).replaceAll('\\', '/');
const pathExists = async (path) =>
  access(path).then(
    () => true,
    () => false
  );

const collectSourceFiles = async (path) => {
  const entries = await readdir(path, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        if (entry.isDirectory() && skippedDirectories.has(entry.name))
          return [];
        const entryPath = join(path, entry.name);
        if (entry.isDirectory()) return collectSourceFiles(entryPath);
        return sourceExtensions.test(entry.name) ? [entryPath] : [];
      })
    )
  ).flat();
};

const discoverSourceRoots = async () => {
  const roots = [];
  for (const parent of sourceParents) {
    const parentPath = join(repoRoot, parent);
    for (const entry of await readdir(parentPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sourceRoot = join(parentPath, entry.name, 'src');
      if (await pathExists(sourceRoot)) roots.push(sourceRoot);
    }
  }
  return roots;
};

const isTestSource = (repositoryPath) =>
  /\/(?:__tests__|fixtures|test-utils)\//.test(`/${repositoryPath}`) ||
  /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(repositoryPath);

const issues = [];
const addIssue = (message) => issues.push(message);
const versionedSymbolPattern = /\b(?:PIR|Pir|pir)[_-]?[Vv]\d+[A-Za-z0-9_]*\b/g;
const stagedVersionTextPattern = /\b(?:staged\s+)?PIR\s+v\d+(?:\.\d+)+\b/gi;
const numericVersionBranchPattern =
  /(?:\.version|\bversion)\s*(?:===|!==|==|!=)\s*['"]?\d+(?:\.\d+)+['"]?/g;
const numericPirVersionLiteralPattern =
  /\b(?:pirVersion|pirSchemaVersion|PIR_VERSION|PIR_SCHEMA_VERSION)\s*[:=]\s*['"]\d+(?:\.\d+)+['"]/g;
const currentOrStagedSymbolPattern =
  /\b(?:(?:current|staged)(?:PIR|Pir)|(?:PIR|Pir)(?:Current|Staged))[A-Za-z0-9_]*\b/g;
const generatedWireImportPattern =
  /(?:@prodivix\/shared\/(?:types\/pir(?:\.generated)?|pir-wire)|(?:pirWire|pir)\.generated)/g;
const publicWireImportPattern = /@prodivix\/pir\/wire/g;
const wireSymbolPattern =
  /\b(?:CURRENT_PIR_WIRE_VERSION|PIRWire[A-Z][A-Za-z0-9_]*)\b/g;

for (const sourceRoot of await discoverSourceRoots()) {
  for (const file of await collectSourceFiles(sourceRoot)) {
    const repositoryPath = toRepositoryPath(file);
    if (isTestSource(repositoryPath)) continue;

    const source = await readFile(file, 'utf8');
    const wireBoundary = isWireBoundary(file);
    const pirConsumer =
      /@prodivix\/pir(?:['"/]|$)|\b(?:PIR|Pir)[A-Z][A-Za-z0-9_]*/.test(source);

    if (
      /\/pir-v\d+(?:\/|$)/i.test(`/${repositoryPath}`) ||
      (pirConsumer && /\/v\d+(?:\/|$)/i.test(`/${repositoryPath}`))
    ) {
      if (!wireBoundary) {
        addIssue(
          `${repositoryPath} uses a versioned PIR production directory.`
        );
      }
    }

    if (!wireBoundary) {
      for (const match of source.matchAll(versionedSymbolPattern)) {
        addIssue(
          `${repositoryPath} exposes versioned PIR symbol ${JSON.stringify(match[0])}.`
        );
      }
      for (const match of source.matchAll(currentOrStagedSymbolPattern)) {
        addIssue(
          `${repositoryPath} exposes staged/current PIR symbol ${JSON.stringify(match[0])}; use the stable domain name.`
        );
      }
      for (const pattern of [
        generatedWireImportPattern,
        publicWireImportPattern,
        wireSymbolPattern,
      ]) {
        for (const match of source.matchAll(pattern)) {
          addIssue(
            `${repositoryPath} consumes PIR wire boundary ${JSON.stringify(match[0])} outside @prodivix/pir.`
          );
        }
      }
      for (const match of source.matchAll(stagedVersionTextPattern)) {
        addIssue(
          `${repositoryPath} treats ${JSON.stringify(match[0])} as a production architecture.`
        );
      }
      if (pirConsumer) {
        for (const pattern of [
          numericVersionBranchPattern,
          numericPirVersionLiteralPattern,
        ]) {
          for (const match of source.matchAll(pattern)) {
            addIssue(
              `${repositoryPath} branches on or owns numeric PIR version ${JSON.stringify(match[0])}.`
            );
          }
        }
      }
    }
  }
}

const readPackageJson = async (packagePath) => {
  try {
    return JSON.parse(await readFile(packagePath, 'utf8'));
  } catch (error) {
    addIssue(
      `${toRepositoryPath(packagePath)} is invalid JSON: ${error.message}`
    );
    return null;
  }
};

for (const parent of sourceParents) {
  const parentPath = join(repoRoot, parent);
  for (const entry of await readdir(parentPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packagePath = join(parentPath, entry.name, 'package.json');
    if (!(await pathExists(packagePath))) continue;
    const manifest = await readPackageJson(packagePath);
    if (!manifest) continue;
    const serializedExports = JSON.stringify(manifest.exports ?? {});
    for (const match of serializedExports.matchAll(versionedSymbolPattern)) {
      addIssue(
        `${toRepositoryPath(packagePath)} exposes versioned PIR package path ${JSON.stringify(match[0])}.`
      );
    }
    if (
      /pir/i.test(manifest.name ?? '') &&
      Object.keys(manifest.exports ?? {}).some((key) =>
        /(?:^|\/)v\d+(?:\/|$)/i.test(key)
      )
    ) {
      addIssue(
        `${toRepositoryPath(packagePath)} exposes a numeric PIR version subpath.`
      );
    }
    if (
      manifest.name === '@prodivix/shared' &&
      Object.keys(manifest.exports ?? {}).some((key) =>
        key.startsWith('./types/')
      )
    ) {
      addIssue(
        'packages/shared/package.json exposes internal generated types through a wildcard; @prodivix/pir/wire must be the only public PIR wire entry.'
      );
    }
    if (
      manifest.name === '@prodivix/pir' &&
      !Object.hasOwn(manifest.exports ?? {}, './wire')
    ) {
      addIssue(
        'packages/pir/package.json must expose the explicit ./wire boundary.'
      );
    }
  }
}

if (await pathExists(legacyGeneratedWirePath)) {
  addIssue(
    'packages/shared/src/types/pir.generated.ts duplicates PIR wire ownership; generate only packages/pir/src/codec/pirWire.generated.ts.'
  );
}
if (!(await pathExists(generatedWirePath))) {
  addIssue('packages/pir/src/codec/pirWire.generated.ts is missing.');
}

const resolveLocalJsonPointer = (document, pointer) => {
  if (!pointer.startsWith('#/')) return undefined;
  return pointer
    .slice(2)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce(
      (value, segment) =>
        value && typeof value === 'object' ? value[segment] : undefined,
      document
    );
};

const readSchemaVersion = (schema) => {
  let rootSchema = schema;
  const visited = new Set();
  while (
    rootSchema &&
    typeof rootSchema === 'object' &&
    typeof rootSchema.$ref === 'string' &&
    rootSchema.$ref.startsWith('#/')
  ) {
    if (visited.has(rootSchema.$ref)) return null;
    visited.add(rootSchema.$ref);
    rootSchema = resolveLocalJsonPointer(schema, rootSchema.$ref);
  }
  const version = rootSchema?.properties?.version?.const;
  return typeof version === 'string' ? version : null;
};

const manifestPath = join(repoRoot, 'specs/pir/PIR-current.version.json');
const currentSchemaPath = join(repoRoot, 'specs/pir/PIR-current.json');
try {
  const activationManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const activatedVersion = activationManifest?.version;
  if (
    typeof activatedVersion !== 'string' ||
    !/^\d+(?:\.\d+)*$/.test(activatedVersion)
  ) {
    addIssue(
      'specs/pir/PIR-current.version.json has no canonical numeric version.'
    );
  } else {
    const snapshotPath = join(
      repoRoot,
      `specs/pir/PIR-v${activatedVersion}.json`
    );
    const [snapshotSource, currentSource] = await Promise.all([
      readFile(snapshotPath, 'utf8'),
      readFile(currentSchemaPath, 'utf8'),
    ]);
    const snapshotVersion = readSchemaVersion(JSON.parse(snapshotSource));
    if (snapshotVersion !== activatedVersion) {
      addIssue(
        `${toRepositoryPath(snapshotPath)} declares ${JSON.stringify(snapshotVersion)} instead of ${JSON.stringify(activatedVersion)}.`
      );
    }
    if (snapshotSource !== currentSource) {
      addIssue(
        'specs/pir/PIR-current.json is stale; run `pnpm run pir:sync-wire`.'
      );
    }

    const generatedSource = await readFile(generatedWirePath, 'utf8');
    const escapedVersion = activatedVersion.replaceAll('.', '\\.');
    if (
      !new RegExp(
        `CURRENT_PIR_WIRE_VERSION\\s*=\\s*['"]${escapedVersion}['"]`
      ).test(generatedSource)
    ) {
      addIssue(
        'packages/pir/src/codec/pirWire.generated.ts does not match the activated PIR wire version.'
      );
    }

    const backendSchemaPath = join(
      repoRoot,
      'apps/backend/internal/platform/pircontract/current_schema.generated.json'
    );
    const backendVersionPath = join(
      repoRoot,
      'apps/backend/internal/platform/pircontract/current_version.generated.go'
    );
    const [backendSchema, backendVersion] = await Promise.all([
      readFile(backendSchemaPath, 'utf8'),
      readFile(backendVersionPath, 'utf8'),
    ]);
    if (backendSchema !== currentSource) {
      addIssue(
        'Backend generated PIR schema is stale; run `pnpm run pir:sync-wire`.'
      );
    }
    if (
      !backendVersion.includes(
        `const CurrentVersion = ${JSON.stringify(activatedVersion)}`
      )
    ) {
      addIssue(
        'Backend generated PIR version does not match the activation manifest.'
      );
    }
  }
} catch (error) {
  addIssue(`Unable to verify PIR activation artifacts: ${error.message}`);
}

const changedSnapshots = spawnSync(
  'git',
  ['diff', '--name-only', 'HEAD', '--', 'specs/pir'],
  { cwd: repoRoot, encoding: 'utf8' }
);
if (changedSnapshots.status === 0) {
  for (const repositoryPath of changedSnapshots.stdout.split(/\r?\n/)) {
    if (!/^specs\/pir\/PIR-v\d+(?:\.\d+)*\.json$/.test(repositoryPath)) {
      continue;
    }
    const existedAtHead = spawnSync(
      'git',
      ['cat-file', '-e', `HEAD:${repositoryPath}`],
      { cwd: repoRoot, stdio: 'ignore' }
    );
    if (existedAtHead.status === 0) {
      addIssue(
        `${repositoryPath} is an immutable wire snapshot and must not be modified; add a new snapshot instead.`
      );
    }
  }
}

if (issues.length > 0) {
  console.error(issues.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    'PIR-current production, package-export, and generated-wire boundaries are valid.'
  );
}
