import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const workflowsRoot = join(repoRoot, '.github', 'workflows');
const rootlessRegistryPath = 'scripts/ci/configure-rootless-podman.sh';
const rootlessPullPath = 'scripts/ci/pull-rootless-podman-image.sh';
const invocation = `bash ${rootlessRegistryPath}`;
const pullInvocation = `bash ${rootlessPullPath}`;
const issues = [];
const consumers = [];

const workflowEntries = await readdir(workflowsRoot, {
  withFileTypes: true,
});
for (const entry of workflowEntries) {
  if (
    !entry.isFile() ||
    (!entry.name.endsWith('.yml') && !entry.name.endsWith('.yaml'))
  ) {
    continue;
  }
  const source = await readFile(join(workflowsRoot, entry.name), 'utf8');
  if (!source.includes(invocation) && !source.includes(pullInvocation)) {
    continue;
  }
  consumers.push(entry.name);

  const declaredPathBlockCount = [
    ...source.matchAll(/^\s{4}paths:\r?$/gmu),
  ].length;
  const pathBlocks = [
    ...source.matchAll(
      /^\s{4}paths:\r?\n((?:\s{6}- '[^']+'\r?\n)+)/gmu
    ),
  ].map(
    (match) =>
      new Set(
        [...match[1].matchAll(/^\s{6}- '([^']+)'\r?$/gmu)].map(
          (pathMatch) => pathMatch[1]
        )
      )
  );
  if (
    declaredPathBlockCount !== 2 ||
    pathBlocks.length !== declaredPathBlockCount
  ) {
    issues.push(
      `${entry.name} must declare exactly two quoted pull_request/push path filters.`
    );
    continue;
  }
  for (const paths of pathBlocks) {
    if (source.includes(invocation) && !paths.has(rootlessRegistryPath)) {
      issues.push(
        `${entry.name} must trigger when ${rootlessRegistryPath} changes.`
      );
    }
    if (source.includes(pullInvocation) && !paths.has(rootlessPullPath)) {
      issues.push(
        `${entry.name} must trigger when ${rootlessPullPath} changes.`
      );
    }
  }
}

if (!consumers.length) {
  issues.push('No workflow consumes the rootless Podman registry.');
}

if (issues.length) {
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log(
    `Rootless workflow trigger closure is valid across ${consumers.length} workflows.`
  );
}
