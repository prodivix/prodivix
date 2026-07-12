import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const trackedFiles = execFileSync(
  'git',
  [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    'apps/web/src/**/*.ts',
    'apps/web/src/**/*.tsx',
  ],
  { cwd: repoRoot, encoding: 'utf8' }
)
  .split(/\r?\n/)
  .filter(Boolean)
  .filter(
    (path) =>
      !path.includes('/__tests__/') &&
      !/\.(?:test|spec)\.[jt]sx?$/.test(path) &&
      !path.includes('/test-utils/')
  );

const forbiddenPatterns = [
  {
    pattern: /\b(?:setPirDoc|updatePirDoc|pirDocRevision)\b/,
    reason: 'legacy PIR Store API',
  },
  {
    pattern:
      /\bstate\.(?:pirDoc|workspaceId|workspaceRev|routeRev|opSeq|workspaceDocumentsById|treeRootId|treeById|routeManifest|activeDocumentId|activeRouteNodeId)\b/,
    reason: 'flattened Workspace Store mirror',
  },
  {
    pattern:
      /editorStore\.(?:normalizers|pirSlice|routeIntent|routeCommands|tree)/,
    reason: 'retired Web-owned Workspace core module',
  },
  {
    pattern:
      /editor\/features\/blueprint\/editor\/model\/nodeReferenceTransaction/,
    reason: 'retired Web-owned node reference transaction planner',
  },
  {
    pattern:
      /prodivix:(?:nodegraph|animation):native|prodivix\.iconLibraryIds|resourceManager\.code\.create/,
    reason: 'authoring state localStorage mirror',
  },
  {
    pattern:
      /export\s+type\s+(?:WorkspaceSnapshot|WorkspaceDocumentRecord|WorkspaceDocumentType)\b/,
    reason: 'Web-owned duplicate Workspace contract',
  },
  {
    pattern:
      /export\s+type\s+(?:WorkspaceOperation|WorkspaceHistoryEntry|WorkspaceHistoryScope|WorkspaceHistoryState)\b/,
    reason: 'Web-owned duplicate Workspace History contract',
  },
  {
    pattern: /\bcreateMountedCssNodeId\b/,
    reason: 'retired Web-owned Workspace VFS node id helper',
  },
];

const issues = [];
for (const path of trackedFiles) {
  let source;
  try {
    source = await readFile(join(repoRoot, path), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') continue;
    throw error;
  }
  const lines = source.split(/\r?\n/);
  for (const { pattern, reason } of forbiddenPatterns) {
    lines.forEach((line, index) => {
      if (pattern.test(line)) {
        issues.push(`${path}:${index + 1} contains ${reason}.`);
      }
    });
  }
}

if (issues.length) {
  console.error(issues.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Editor Hard Cut boundaries are valid.');
}
