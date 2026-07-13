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
    'apps/backend/internal/**/*.go',
  ],
  { cwd: repoRoot, encoding: 'utf8' }
)
  .split(/\r?\n/)
  .filter(Boolean)
  .filter(
    (path) =>
      !path.includes('/__tests__/') &&
      !/\.(?:test|spec)\.[jt]sx?$/.test(path) &&
      !path.endsWith('_test.go') &&
      !path.includes('/test-utils/')
  );

const editorBrowserStorageAllowlist = new Set([
  'apps/web/src/editor/EditorDebugFloatingBall.tsx',
  'apps/web/src/editor/features/blueprint/editor/controller/useBlueprintEditorController.ts',
  'apps/web/src/editor/features/issues/workspaceIssueNavigation.ts',
  'apps/web/src/editor/features/resources/CodeResourcePage.tsx',
  'apps/web/src/editor/features/resources/I18nResourcePage.tsx',
  'apps/web/src/editor/features/resources/ProjectFileManager.tsx',
  'apps/web/src/editor/features/resources/ProjectResources.tsx',
  'apps/web/src/editor/features/resources/PublicResourcePage.tsx',
  'apps/web/src/editor/features/resources/i18nResourceModel.ts',
  'apps/web/src/editor/store/useSettingsStore.ts',
]);

const editorIndexedDbAllowlist = [
  'apps/web/src/editor/localProjectStore.ts',
  'apps/web/src/editor/workspaceSync/indexedDb',
];

const operationCommitCallPattern =
  /editorApi\s*(?:\.\s*commitWorkspaceOperation|\[\s*['"]commitWorkspaceOperation['"]\s*\])\s*\(/;
const settingsCommitCallPattern =
  /editorApi\s*(?:\.\s*commitWorkspaceSettings|\[\s*['"]commitWorkspaceSettings['"]\s*\])\s*\(/;

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
  if (path.startsWith('apps/web/src/core/')) {
    issues.push(`${path} is inside the retired Web-owned core directory.`);
  }
  if (path.startsWith('apps/web/src/pir/renderer/')) {
    issues.push(`${path} is inside the retired Web-owned PIR renderer.`);
  }
  if (
    path.startsWith('apps/web/src/editor/') &&
    /(?:localStorage|sessionStorage)\s*(?:\?\.|\.)/.test(source) &&
    !editorBrowserStorageAllowlist.has(path)
  ) {
    issues.push(
      `${path} uses browser storage outside the audited UI-preference allowlist.`
    );
  }
  if (
    path.startsWith('apps/web/src/editor/') &&
    /\b(?:indexedDB|indexedDb)\b/.test(source) &&
    !editorIndexedDbAllowlist.some((prefix) => path.startsWith(prefix))
  ) {
    issues.push(
      `${path} creates an unaudited persistent editor mirror outside local project or Workspace Outbox/replica adapters.`
    );
  }
  if (
    path.startsWith('apps/web/src/') &&
    path !== 'apps/web/src/editor/editorApi.ts' &&
    /\/(?:operations|settings)\/commit\b/.test(source)
  ) {
    issues.push(
      `${path} owns a raw Atomic Commit transport outside editorApi.`
    );
  }
  if (
    path !== 'apps/web/src/editor/Editor.tsx' &&
    path !== 'apps/web/src/editor/localProjectStore.ts' &&
    /\bsaveLocalWorkspaceSnapshot\s*\(/.test(source)
  ) {
    issues.push(`${path} writes an unaudited local Workspace mirror.`);
  }
  if (
    path !== 'apps/web/src/editor/workspaceSync/workspaceOutboxExecutor.ts' &&
    operationCommitCallPattern.test(source)
  ) {
    issues.push(`${path} bypasses the durable Workspace Outbox.`);
  }
  if (
    path !==
      'apps/web/src/editor/workspaceSync/workspaceSettingsOutboxExecutor.ts' &&
    settingsCommitCallPattern.test(source)
  ) {
    issues.push(`${path} bypasses the durable Settings Outbox.`);
  }
  if (
    /\b(?:saveProjectPir|HandleGetProjectPIR|SyncProjectMirrorFromWorkspace|BootstrapProjectWorkspace)\b/.test(
      source
    ) ||
    /\bSavePIR\s*\(/.test(source) ||
    /\/projects\/:id\/pir\b/.test(source) ||
    /\/projects\/\$\{[^}]+\}\/pir\b/.test(source) ||
    /UPDATE\s+projects[\s\S]{0,500}?SET\s+pir_json\b/i.test(source) ||
    ((path.startsWith('apps/backend/internal/modules/project/') ||
      path.startsWith('apps/backend/internal/modules/workspace/')) &&
      /\bpir_json\b/.test(source)) ||
    (path === 'apps/backend/internal/modules/workspace/module.go' &&
      /module\.projects\.GetByID\s*\(/.test(source))
  ) {
    issues.push(`${path} exposes the retired Project PIR mirror.`);
  }
  if (
    path.startsWith('apps/backend/internal/platform/database/') &&
    /\bpir_json\b/.test(
      source.replace(/ALTER TABLE projects DROP COLUMN IF EXISTS pir_json/g, '')
    )
  ) {
    issues.push(`${path} recreates the retired Project PIR database column.`);
  }
  if (
    path !== 'apps/backend/internal/modules/workspace/module.go' &&
    /\.InsertPreparedProject\s*\(/.test(source)
  ) {
    issues.push(
      `${path} inserts Project metadata outside the atomic project Workspace boundary.`
    );
  }
  const projectInsertCount =
    source.match(/INSERT\s+INTO\s+projects\b/gi)?.length ?? 0;
  if (
    projectInsertCount > 0 &&
    (path !== 'apps/backend/internal/modules/project/store.go' ||
      projectInsertCount !== 1)
  ) {
    issues.push(
      `${path} owns a Project insert outside the single transactional Store primitive.`
    );
  }
  if (
    path !== 'apps/backend/internal/modules/workspace/store_snapshot.go' &&
    /\.ImportWorkspaceSnapshot\s*\(/.test(source)
  ) {
    issues.push(
      `${path} imports a Workspace outside the atomic project creation boundary.`
    );
  }
  const lines = source.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/@\/core(?:\/|['"])/.test(line)) {
      issues.push(`${path}:${index + 1} imports the retired Web-owned core.`);
    }
    if (/@\/pir\/renderer(?:\/|['"])/.test(line)) {
      issues.push(
        `${path}:${index + 1} imports the retired Web-owned PIR renderer.`
      );
    }
    if (/\b(?:applyWorkspaceIntent|patchWorkspaceDocument)\b/.test(line)) {
      issues.push(
        `${path}:${index + 1} exposes a retired Workspace write API.`
      );
    }
    if (
      path.startsWith('apps/backend/internal/modules/workspace/') &&
      /(?:HandleApplyWorkspaceIntent|HandlePatchWorkspaceDocument|PatchDocumentContent|\/workspaces\/:workspaceId\/intents)/.test(
        line
      )
    ) {
      issues.push(`${path}:${index + 1} exposes a retired backend write path.`);
    }
  });
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
