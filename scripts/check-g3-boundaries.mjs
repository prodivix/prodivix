import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const packagesRoot = join(repoRoot, 'packages');

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const packageEntries = await readdir(packagesRoot, { withFileTypes: true });
const packages = new Map();
for (const entry of packageEntries) {
  if (!entry.isDirectory()) continue;
  const manifestPath = join(packagesRoot, entry.name, 'package.json');
  const manifest = await readJson(manifestPath).catch(() => null);
  if (manifest?.name?.startsWith('@prodivix/')) {
    packages.set(manifest.name, {
      directory: entry.name,
      dependencies: new Set(
        [
          ...Object.keys(manifest.dependencies ?? {}),
          ...Object.keys(manifest.optionalDependencies ?? {}),
        ].filter((name) => name.startsWith('@prodivix/'))
      ),
    });
  }
}

const issues = [];
const expectedDependencies = new Map([
  [
    '@prodivix/behavior',
    new Set([
      '@prodivix/diagnostics',
      '@prodivix/runtime-core',
      '@prodivix/shared',
    ]),
  ],
  [
    '@prodivix/verification',
    new Set([
      '@prodivix/behavior',
      '@prodivix/diagnostics',
      '@prodivix/shared',
    ]),
  ],
]);

for (const [name, expected] of expectedDependencies) {
  const actual = packages.get(name)?.dependencies;
  if (!actual) {
    issues.push(`${name} package is missing.`);
    continue;
  }
  const hasExactDependencies =
    actual.size === expected.size &&
    [...actual].every((dependency) => expected.has(dependency));
  if (!hasExactDependencies) {
    issues.push(
      `${name} dependencies are ${[...actual].join(', ')}, expected ${[...expected].join(', ')}.`
    );
  }
}

const workspaceDependencies = packages.get('@prodivix/workspace')?.dependencies;
for (const dependency of ['@prodivix/behavior', '@prodivix/verification']) {
  if (!workspaceDependencies?.has(dependency)) {
    issues.push(`@prodivix/workspace must compose ${dependency}.`);
  }
}

const findPath = (from, target, visited = new Set()) => {
  if (from === target) return [from];
  if (visited.has(from)) return null;
  visited.add(from);
  for (const dependency of packages.get(from)?.dependencies ?? []) {
    const path = findPath(dependency, target, new Set(visited));
    if (path) return [from, ...path];
  }
  return null;
};

for (const owner of [
  '@prodivix/behavior',
  '@prodivix/verification',
  '@prodivix/workspace',
]) {
  for (const dependency of packages.get(owner)?.dependencies ?? []) {
    const cycle = findPath(dependency, owner);
    if (cycle) {
      issues.push(
        `G3 package dependency cycle: ${[owner, ...cycle].join(' -> ')}.`
      );
    }
  }
}

const collectSourceFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return collectSourceFiles(path);
        return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
      })
    )
  ).flat();
};

const readImports = (source) =>
  [
    ...source.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)(['"])([^'"]+)\1/g),
  ].map((match) => match[2]);

const behaviorContributorFiles = new Map([
  [
    'router',
    new Set([
      'packages/router/src/routeBehaviorRegistryContribution.ts',
      'packages/router/src/routeBehaviorRegistryContribution.test.ts',
    ]),
  ],
  [
    'pir',
    new Set(['packages/pir/src/authoring/pirBehaviorRegistryContribution.ts']),
  ],
  ['data', new Set(['packages/data/src/dataBehaviorRegistryContribution.ts'])],
  [
    'nodegraph',
    new Set([
      'packages/nodegraph/src/nodeGraphBehaviorContribution.ts',
      'packages/nodegraph/src/nodeGraphBehaviorContribution.test.ts',
    ]),
  ],
  [
    'animation',
    new Set([
      'packages/animation/src/animationBehaviorContribution.ts',
      'packages/animation/src/animationBehaviorContribution.test.ts',
    ]),
  ],
]);
for (const [directory, contributorPaths] of behaviorContributorFiles) {
  const packageName = `@prodivix/${directory}`;
  if (!packages.get(packageName)?.dependencies.has('@prodivix/behavior')) {
    issues.push(
      `${packageName} must depend on the Behavior contribution contract.`
    );
  }
  for (const file of await collectSourceFiles(
    join(packagesRoot, directory, 'src')
  )) {
    const importsBehavior = readImports(await readFile(file, 'utf8')).some(
      (specifier) => specifier === '@prodivix/behavior'
    );
    if (
      importsBehavior &&
      !contributorPaths.has(relative(repoRoot, file).replaceAll('\\', '/'))
    ) {
      issues.push(
        `${relative(repoRoot, file)} may import @prodivix/behavior only from the domain registry contribution or its conformance test.`
      );
    }
  }
}

const ownerImportRules = new Map([
  [
    'behavior',
    new Set([
      '@prodivix/diagnostics',
      '@prodivix/runtime-core',
      '@prodivix/shared/canonical',
      '@prodivix/shared/safety',
    ]),
  ],
  [
    'verification',
    new Set([
      '@prodivix/behavior',
      '@prodivix/diagnostics',
      '@prodivix/shared/canonical',
      '@prodivix/shared/safety',
    ]),
  ],
]);

for (const [directory, allowedInternalImports] of ownerImportRules) {
  for (const file of await collectSourceFiles(
    join(packagesRoot, directory, 'src')
  )) {
    const source = await readFile(file, 'utf8');
    for (const specifier of readImports(source)) {
      if (
        specifier.startsWith('@prodivix/') &&
        !allowedInternalImports.has(specifier)
      ) {
        issues.push(
          `${relative(repoRoot, file)} imports disallowed owner dependency ${specifier}.`
        );
      }
      if (
        /^(?:react|react-dom|zustand|@xyflow\/react)(?:\/|$)/.test(specifier)
      ) {
        issues.push(
          `${relative(repoRoot, file)} imports product/runtime dependency ${specifier}.`
        );
      }
    }
  }
}

const currentModelFiles = [
  join(packagesRoot, 'behavior', 'src', 'behavior.types.ts'),
  join(packagesRoot, 'verification', 'src', 'verification.types.ts'),
];
for (const file of currentModelFiles) {
  const source = await readFile(file, 'utf8');
  const numericVersionFields = [
    ...source.matchAll(/^\s*(?:readonly\s+)?version\s*:\s*number\b/gm),
  ];
  if (numericVersionFields.length) {
    issues.push(
      `${relative(repoRoot, file)} exposes a numeric version in a current model.`
    );
  }
}

const webSourceRoot = join(repoRoot, 'apps', 'web', 'src');
const duplicateDomainType =
  /\b(?:type|interface|class)\s+(?:BehaviorScenario|BehaviorControlProfile|BehaviorFixtureSet|VerificationPolicy|VerificationBaselineSet|VerificationPlan|VerificationEvidence|VerificationClosure)\b/;
for (const file of await collectSourceFiles(webSourceRoot)) {
  if (duplicateDomainType.test(await readFile(file, 'utf8'))) {
    issues.push(
      `${relative(repoRoot, file)} redefines a G3 domain contract owned by a package.`
    );
  }
}

const registry = await readFile(
  join(packagesRoot, 'workspace', 'src', 'workspaceContractRegistry.ts'),
  'utf8'
);
for (const token of [
  "'behavior-scenario'",
  "'behavior-control-profile'",
  "'behavior-fixture-set'",
  "'verification-policy'",
  "'verification-baseline-set'",
  "prefix: 'core.behavior'",
  "prefix: 'core.verification'",
]) {
  if (!registry.includes(token)) {
    issues.push(`Workspace G3 registry is missing ${token}.`);
  }
}

const extractDiagnosticCodes = (source, prefix, expression) =>
  new Set(
    [...source.matchAll(expression)]
      .map((match) => match[1])
      .filter((code) => code?.startsWith(`${prefix}-`))
  );

for (const domain of [
  {
    prefix: 'BHV',
    registryPath: join(
      packagesRoot,
      'behavior',
      'src',
      'behaviorDiagnosticRegistry.ts'
    ),
    specPath: join(
      repoRoot,
      'specs',
      'diagnostics',
      'behavior-diagnostic-codes.md'
    ),
  },
  {
    prefix: 'VER',
    registryPath: join(
      packagesRoot,
      'verification',
      'src',
      'verificationDiagnosticRegistry.ts'
    ),
    specPath: join(
      repoRoot,
      'specs',
      'diagnostics',
      'verification-diagnostic-codes.md'
    ),
  },
]) {
  const registrySource = await readFile(domain.registryPath, 'utf8');
  const specSource = await readFile(domain.specPath, 'utf8');
  const registryCodes = extractDiagnosticCodes(
    registrySource,
    domain.prefix,
    /['"]([A-Z]+-\d{4})['"]/g
  );
  const specCodes = extractDiagnosticCodes(
    specSource,
    domain.prefix,
    /^### `([A-Z]+-\d{4})`/gm
  );
  for (const code of specCodes) {
    if (!registryCodes.has(code)) {
      issues.push(
        `${code} is specified but missing from the runtime registry.`
      );
    }
    const generatedReference = join(
      repoRoot,
      'apps',
      'docs',
      'reference',
      'diagnostics',
      `${code.toLowerCase()}.md`
    );
    if (!(await readFile(generatedReference, 'utf8').catch(() => null))) {
      issues.push(
        `${code} is missing its generated diagnostic reference page.`
      );
    }
  }
  for (const code of registryCodes) {
    if (!specCodes.has(code)) {
      issues.push(`${code} is registered but missing from the canonical spec.`);
    }
  }
}

for (const [path, tokens] of [
  [
    join(repoRoot, 'docs', 'architecture', 'package-ownership.md'),
    ['`@prodivix/behavior`', '`@prodivix/verification`'],
  ],
  [
    join(packagesRoot, 'behavior', 'src', 'behavior.types.ts'),
    [
      'workspaceDocumentId: string',
      'BehaviorRegistryContribution',
      'semanticSnapshotDigest: string',
      'programDigest: string',
      'identifiers: Readonly',
      'settle: Readonly',
    ],
  ],
  [
    join(packagesRoot, 'verification', 'src', 'verification.types.ts'),
    [
      'VerificationPolicyRequirement',
      'defaultRequirement: VerificationPolicyRequirement',
      'matrixProfiles: readonly VerificationMatrixProfile[]',
      'retryPolicies: readonly VerificationRetryPolicy[]',
      'evidenceRequirements: VerificationEvidenceRequirements',
      'adapterRegistryDigest: string',
    ],
  ],
  [
    join(repoRoot, 'specs', 'workspace', 'workspace-model.md'),
    [
      '`behavior-scenario`',
      '`behavior-control-profile`',
      '`behavior-fixture-set`',
      '`verification-policy`',
      '`verification-baseline-set`',
    ],
  ],
  [
    join(repoRoot, 'specs', 'api', 'workspace-sync.openapi.yaml'),
    [
      'behavior-scenario',
      'behavior-control-profile',
      'behavior-fixture-set',
      'verification-policy',
      'verification-baseline-set',
    ],
  ],
  [
    join(
      repoRoot,
      'apps',
      'backend',
      'internal',
      'modules',
      'workspace',
      'store.go'
    ),
    [
      'WorkspaceDocumentTypeBehaviorScenario',
      'WorkspaceDocumentTypeBehaviorControlProfile',
      'WorkspaceDocumentTypeBehaviorFixtureSet',
      'WorkspaceDocumentTypeVerificationPolicy',
      'WorkspaceDocumentTypeVerificationBaselineSet',
    ],
  ],
  [
    join(
      repoRoot,
      'apps',
      'backend',
      'internal',
      'modules',
      'workspace',
      'operation_commit_types.go'
    ),
    ['"behavior", "verification"', '"core.behavior"', '"core.verification"'],
  ],
  [
    join(
      repoRoot,
      'apps',
      'backend',
      'internal',
      'modules',
      'workspace',
      'operation_commit_apply.go'
    ),
    ['return "behavior"', 'return "verification"'],
  ],
  [
    join(
      repoRoot,
      'apps',
      'backend',
      'internal',
      'modules',
      'workspace',
      'response.go'
    ),
    [
      '"core.behavior.document.update@1.0"',
      '"core.verification.document.update@1.0"',
    ],
  ],
  [
    join(
      repoRoot,
      'apps',
      'backend',
      'internal',
      'modules',
      'workspace',
      'store_helpers.go'
    ),
    [
      'behaviorcontract.ValidateDocument',
      'verificationcontract.ValidateDocument',
      'isSingletonWorkspaceDocumentType',
    ],
  ],
  [
    join(
      repoRoot,
      'apps',
      'backend',
      'internal',
      'platform',
      'database',
      'database.go'
    ),
    ['idx_workspace_documents_single_verification_policy'],
  ],
  [
    join(
      repoRoot,
      'apps',
      'backend',
      'internal',
      'platform',
      'behaviorcontract',
      'semantic.go'
    ),
    [
      'duplicate BehaviorStep id',
      'references unknown BehaviorStep',
      'custom Behavior assertions require a CodeReference id',
    ],
  ],
  [
    join(
      repoRoot,
      'apps',
      'backend',
      'internal',
      'platform',
      'verificationcontract',
      'semantic.go'
    ),
    [
      'references unknown matrix profile',
      'conflicting requirements',
      'same compatibility identity',
    ],
  ],
]) {
  const source = await readFile(path, 'utf8');
  for (const token of tokens) {
    if (!source.includes(token)) {
      issues.push(`${relative(repoRoot, path)} is missing ${token}.`);
    }
  }
}

if (issues.length) {
  console.error(issues.join('\n'));
  process.exitCode = 1;
} else {
  console.log('G3 owner, dependency, and application boundaries are valid.');
}
