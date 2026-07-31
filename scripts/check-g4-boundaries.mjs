import { access, readFile, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const packagesRoot = join(repoRoot, 'packages');
const issues = [];
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const exists = async (path) =>
  access(path, constants.F_OK)
    .then(() => true)
    .catch(() => false);

const packageEntries = await readdir(packagesRoot, { withFileTypes: true });
const packages = new Map();
for (const entry of packageEntries) {
  if (!entry.isDirectory()) continue;
  const manifest = await readJson(
    join(packagesRoot, entry.name, 'package.json')
  ).catch(() => null);
  if (!manifest?.name?.startsWith('@prodivix/')) continue;
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

const aiDependencies = packages.get('@prodivix/ai')?.dependencies;
const expectedAiDependencies = new Set([
  '@prodivix/diagnostics',
  '@prodivix/shared',
]);
if (
  !aiDependencies ||
  aiDependencies.size !== expectedAiDependencies.size ||
  [...aiDependencies].some(
    (dependency) => !expectedAiDependencies.has(dependency)
  )
) {
  issues.push(
    `@prodivix/ai dependencies must be exactly ${[
      ...expectedAiDependencies,
    ].join(', ')}.`
  );
}
if (!packages.get('@prodivix/workspace')?.dependencies.has('@prodivix/ai')) {
  issues.push(
    '@prodivix/workspace must compose the @prodivix/ai current owner.'
  );
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
for (const dependency of aiDependencies ?? []) {
  const cycle = findPath(dependency, '@prodivix/ai');
  if (cycle) {
    issues.push(
      `G4 package dependency cycle: @prodivix/ai -> ${cycle.join(' -> ')}.`
    );
  }
}

const collectSourceFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => []
  );
  return (
    await Promise.all(
      entries.map(async (entry) => {
        if (entry.name === 'dist' || entry.name === 'node_modules') return [];
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return collectSourceFiles(path);
        return /\.(?:go|ts|tsx)$/u.test(entry.name) &&
          !/\.(?:test|spec)\.(?:ts|tsx)$/u.test(entry.name)
          ? [path]
          : [];
      })
    )
  ).flat();
};

const sourceFiles = [
  ...(await collectSourceFiles(join(repoRoot, 'apps'))),
  ...(await collectSourceFiles(join(repoRoot, 'packages'))),
];
const ownerTypes = [
  'AgentPolicy',
  'AgentTaskSpec',
  'AgentRun',
  'AgentCapabilityGrant',
  'AgentContextPack',
  'AgentActionProposal',
  'AgentProposalPreview',
  'AgentApprovalDecision',
  'AgentAuditEvent',
];
const declarationPattern = new RegExp(
  `^(?:export\\s+)?(?:type|interface|class)\\s+(${ownerTypes.join('|')})\\b|^type\\s+(${ownerTypes.join('|')})\\s+struct\\b`,
  'gmu'
);
const forbiddenToolName =
  /(?:^|[._:/-])(?:apply|approve|approval|commit|rollback)(?:$|[._:/-])|(?:^|[._:/-])(?:workspace[._:/-]patch|json[._:/-]patch|file[._:/-]write)(?:$|[._:/-])/iu;

for (const file of sourceFiles) {
  const source = await readFile(file, 'utf8');
  const path = relative(repoRoot, file).replaceAll('\\', '/');
  for (const match of source.matchAll(declarationPattern)) {
    if (!path.startsWith('packages/ai/src/domain/')) {
      issues.push(
        `${path} duplicates @prodivix/ai owner type ${match[1] ?? match[2]}.`
      );
    }
  }
  if (source.includes('@prodivix/shared/llm') || source.includes('/src/llm')) {
    issues.push(`${path} still imports the retired shared LLM owner.`);
  }
  if (source.includes('@prodivix/ai/src/')) {
    issues.push(`${path} bypasses the public @prodivix/ai package boundary.`);
  }
  if (source.includes('AiDraftToolRegistry') && source.includes('.register(')) {
    for (const match of source.matchAll(/name\s*:\s*(['"])([^'"]+)\1/gu)) {
      if (forbiddenToolName.test(match[2])) {
        issues.push(
          `${path} registers model-callable authoring tool ${match[2]}.`
        );
      }
    }
  }
}

const sharedLlmDirectory = join(packagesRoot, 'shared', 'src', 'llm');
if ((await readdir(sharedLlmDirectory).catch(() => [])).length > 0) {
  issues.push(
    'packages/shared/src/llm must be removed by the G4 owner hard cut.'
  );
}
const sharedIndex = await readFile(
  join(packagesRoot, 'shared', 'src', 'index.ts'),
  'utf8'
);
if (/llm/iu.test(sharedIndex)) {
  issues.push(
    'The shared package root must not re-export the retired LLM owner.'
  );
}

const currentSource = await readFile(
  join(packagesRoot, 'ai', 'src', 'domain', 'agent.types.ts'),
  'utf8'
);
if (/\b(?:wireVersion|schemaVersion)\??\s*:/u.test(currentSource)) {
  issues.push('G4 current domain must not expose wire/schema version fields.');
}
if (/\bversion\??\s*:\s*number\b/u.test(currentSource)) {
  issues.push('G4 current domain must not expose a numeric version field.');
}

const draftRegistrySource = await readFile(
  join(packagesRoot, 'ai', 'src', 'draft', 'aiDraftToolRegistry.ts'),
  'utf8'
);
for (const token of [
  'apply',
  'approve',
  'approval',
  'commit',
  'rollback',
  'workspace[._:/-]patch',
  'json[._:/-]patch',
  'file[._:/-]write',
]) {
  if (!draftRegistrySource.includes(token)) {
    issues.push(`AI draft registry hard cut is missing ${token}.`);
  }
}

const workspaceRegistry = await readFile(
  join(packagesRoot, 'workspace', 'src', 'workspaceContractRegistry.ts'),
  'utf8'
);
const workspaceAgentDocument = await readFile(
  join(packagesRoot, 'workspace', 'src', 'workspaceAgentPolicyDocument.ts'),
  'utf8'
);
for (const token of ["'agent-policy'", "'agent'", "prefix: 'core.agent'"]) {
  if (!workspaceRegistry.includes(token)) {
    issues.push(`Workspace G4 registry is missing ${token}.`);
  }
}
for (const token of [
  'createWorkspaceAgentPolicyDocumentCommand',
  'createWorkspaceAgentPolicyUpdateCommand',
  "namespace: 'core.agent'",
  "domainHint: 'agent'",
]) {
  if (!workspaceAgentDocument.includes(token)) {
    issues.push(`Workspace AgentPolicy owner is missing ${token}.`);
  }
}

const backendFiles = [
  'apps/backend/internal/platform/agentcontract/contract.go',
  'apps/backend/internal/modules/workspace/store_helpers.go',
  'apps/backend/internal/platform/database/agent_policy_migration.go',
];
const backendSource = (
  await Promise.all(
    backendFiles.map((path) => readFile(join(repoRoot, path), 'utf8'))
  )
).join('\n');
for (const token of [
  'ValidateDocument',
  'CanonicalCurrentDigest',
  'WorkspaceDocumentTypeAgentPolicy',
  'g4-agent-policy-workspace-document',
  'idx_workspace_documents_single_agent_policy',
]) {
  if (!backendSource.includes(token)) {
    issues.push(`Backend G4 boundary is missing ${token}.`);
  }
}

const openApiSource = await readFile(
  join(repoRoot, 'specs', 'api', 'workspace-sync.openapi.yaml'),
  'utf8'
);
for (const token of ['- agent-policy', '              agent,']) {
  if (!openApiSource.includes(token)) {
    issues.push(`Workspace OpenAPI is missing ${token.trim()}.`);
  }
}

const workflowSource = await readFile(
  join(repoRoot, '.github', 'workflows', 'g4-boundaries.yml'),
  'utf8'
);
for (const token of [
  "- 'packages/ai/**'",
  "- 'apps/backend/internal/platform/agentcontract/**'",
  'image: postgres:16',
  'run: pnpm run verify:g4:boundaries',
  'run: pnpm run verify:g4:boundaries:postgres',
]) {
  if (!workflowSource.includes(token)) {
    issues.push(`G4 V0 workflow is missing ${token}.`);
  }
}

const diagnosticSource = await readFile(
  join(packagesRoot, 'ai', 'src', 'diagnostics', 'aiDiagnosticRegistry.ts'),
  'utf8'
);
const diagnosticSpec = await readFile(
  join(repoRoot, 'specs', 'diagnostics', 'ai-diagnostic-codes.md'),
  'utf8'
);
const registryCodes = new Set(
  [...diagnosticSource.matchAll(/\[\s*'(AI-\d{4})'\s*,/gu)].map(
    (match) => match[1]
  )
);
const specifiedCodes = new Set(
  [...diagnosticSpec.matchAll(/^### `?(AI-\d{4})`?\b/gmu)].map(
    (match) => match[1]
  )
);
for (const code of new Set([...registryCodes, ...specifiedCodes])) {
  if (!registryCodes.has(code) || !specifiedCodes.has(code)) {
    issues.push(
      `${code} must exist in both the AI registry and diagnostic spec.`
    );
  }
  if (
    !(await exists(
      join(
        repoRoot,
        'apps',
        'docs',
        'reference',
        'diagnostics',
        `${code.toLowerCase()}.md`
      )
    ))
  ) {
    issues.push(`${code} generated diagnostic page is missing.`);
  }
}
for (const stage of ['task', 'tool', 'approval', 'verification', 'audit']) {
  if (!diagnosticSource.includes(`'${stage}'`)) {
    issues.push(`AI diagnostic registry is missing the ${stage} stage.`);
  }
}

if (issues.length) {
  console.error(issues.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    'G4 V0 owner, current/wire, Workspace, diagnostics, and hard-cut boundaries are valid.'
  );
}
