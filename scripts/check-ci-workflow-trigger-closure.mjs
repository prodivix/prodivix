import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRepoRoot = fileURLToPath(new URL('..', import.meta.url));
const rootlessRegistryPath = 'scripts/ci/configure-rootless-podman.sh';
const rootlessPullPath = 'scripts/ci/pull-rootless-podman-image.sh';
const runtimeWorkflows = ['g4-v7-product.yml', 'g4-v9-golden-closure.yml'];

export const validateWorkflowTriggerPaths = (
  name,
  source,
  requiredPaths,
  { expectedCount, quotedOnly = true } = {}
) => {
  const declaredCount = [...source.matchAll(/^\s{4}paths:\r?$/gmu)].length;
  const blockPattern = quotedOnly
    ? /^\s{4}paths:\r?\n((?:\s{6}- '[^']+'\r?\n)+)/gmu
    : /^\s{4}paths:\r?\n((?:\s{6}- [^\r\n]+\r?\n)+)/gmu;
  const blocks = [...source.matchAll(blockPattern)].map(
    (match) =>
      new Set(
        [...match[1].matchAll(/^\s{6}- (.+?)\r?$/gmu)].map((pathMatch) => {
          const value = pathMatch[1].trim();
          return /^(['"]).*\1$/u.test(value) ? value.slice(1, -1) : value;
        })
      )
  );
  if (
    !declaredCount ||
    (expectedCount !== undefined && declaredCount !== expectedCount) ||
    blocks.length !== declaredCount
  ) {
    return [
      `${name} must declare ${expectedCount === undefined ? 'all' : `exactly ${expectedCount}`} ${quotedOnly ? 'quoted ' : ''}push/pull_request path filters.`,
    ];
  }
  return blocks.flatMap((paths, index) =>
    requiredPaths
      .filter((path) => !paths.has(path))
      .map(
        (path) =>
          `${name} path filter ${index + 1} must trigger when ${path} changes.`
      )
  );
};

export const collectWorkspaceDependencyTriggerPaths = (packages, rootName) => {
  const visited = new Set();
  const pending = [rootName];
  const paths = [];
  while (pending.length) {
    const name = pending.shift();
    if (visited.has(name)) continue;
    visited.add(name);
    const entry = packages.get(name);
    if (!entry)
      throw new Error(`Workspace dependency ${name} has no manifest.`);
    paths.push(`${entry.directory}/**`);
    for (const field of [
      'dependencies',
      'optionalDependencies',
      'peerDependencies',
    ]) {
      for (const [dependency, selector] of Object.entries(
        entry.manifest[field] ?? {}
      )) {
        if (typeof selector === 'string' && selector.startsWith('workspace:')) {
          pending.push(dependency);
        }
      }
    }
  }
  return paths.sort();
};

const readWorkspacePackages = async (repoRoot) => {
  const workspaceSource = await readFile(
    join(repoRoot, 'pnpm-workspace.yaml'),
    'utf8'
  );
  const packageBlock = /^packages:\r?\n((?:[ \t]+-[^\r\n]*\r?\n)+)/mu.exec(
    workspaceSource
  );
  if (!packageBlock) throw new Error('Workspace package patterns are missing.');
  const patterns = [...packageBlock[1].matchAll(/^\s+- (.+?)\r?$/gmu)].map(
    (match) => match[1].trim().replace(/^(['"])(.*)\1$/u, '$2')
  );
  const packages = new Map();
  for (const pattern of patterns) {
    if (!/^[a-zA-Z0-9._-]+\/\*$/u.test(pattern)) {
      throw new Error(`Workspace package pattern ${pattern} needs adoption.`);
    }
    const parent = pattern.slice(0, -2);
    let entries;
    try {
      entries = await readdir(join(repoRoot, parent), { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const directory = `${parent}/${entry.name}`;
      let manifest;
      try {
        manifest = JSON.parse(
          await readFile(join(repoRoot, directory, 'package.json'), 'utf8')
        );
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      if (!manifest.name) continue;
      if (packages.has(manifest.name)) {
        throw new Error(`Workspace package ${manifest.name} is duplicated.`);
      }
      packages.set(manifest.name, { directory, manifest });
    }
  }
  return packages;
};

export const checkCiWorkflowTriggerClosure = async (
  repoRoot = defaultRepoRoot
) => {
  const workflowsRoot = join(repoRoot, '.github', 'workflows');
  const workflowEntries = await readdir(workflowsRoot, { withFileTypes: true });
  const workflows = new Map();
  const issues = [];
  const rootlessConsumers = [];
  for (const entry of workflowEntries) {
    if (
      !entry.isFile() ||
      (!entry.name.endsWith('.yml') && !entry.name.endsWith('.yaml'))
    ) {
      continue;
    }
    const source = await readFile(join(workflowsRoot, entry.name), 'utf8');
    workflows.set(entry.name, source);
    const requiredPaths = [rootlessRegistryPath, rootlessPullPath].filter(
      (path) => source.includes(`bash ${path}`)
    );
    if (!requiredPaths.length) continue;
    rootlessConsumers.push(entry.name);
    issues.push(
      ...validateWorkflowTriggerPaths(entry.name, source, requiredPaths, {
        expectedCount: 2,
      })
    );
  }
  if (!rootlessConsumers.length) {
    issues.push('No workflow consumes the rootless Podman registry.');
  }

  const runtimePaths = collectWorkspaceDependencyTriggerPaths(
    await readWorkspacePackages(repoRoot),
    '@prodivix/agent-runtime'
  );
  const requiredRuntimePaths = [
    ...runtimePaths,
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'turbo.json',
    'scripts/check-ci-workflow-trigger-closure.mjs',
  ];
  for (const name of runtimeWorkflows) {
    issues.push(
      ...validateWorkflowTriggerPaths(
        name,
        workflows.get(name) ?? '',
        requiredRuntimePaths,
        { expectedCount: 2 }
      )
    );
  }
  issues.push(
    ...validateWorkflowTriggerPaths(
      'deploy-smoke.yml',
      workflows.get('deploy-smoke.yml') ?? '',
      ['apps/web/docker/nginx.conf'],
      { quotedOnly: false }
    )
  );
  return { issues, rootlessConsumers, runtimePaths };
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await checkCiWorkflowTriggerClosure();
  if (result.issues.length) {
    for (const issue of result.issues) console.error(`- ${issue}`);
    process.exitCode = 1;
  } else {
    console.log(
      `Workflow trigger closure is valid: ${result.rootlessConsumers.length} rootless workflows, ${runtimeWorkflows.length} ordinary-runtime workflows with ${result.runtimePaths.length} workspace owners, and Deploy Smoke nginx configuration.`
    );
  }
}
