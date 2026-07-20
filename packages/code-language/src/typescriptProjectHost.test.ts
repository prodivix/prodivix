import type { CodeArtifact } from '@prodivix/authoring';
import { describe, expect, it } from 'vitest';
import {
  acquireTypeScriptCodeProject,
  createTypeScriptCodeProjectHost,
  disposeTypeScriptCodeProjectHost,
} from './typescriptProjectHost';

const artifact = (source: string, revision: string): CodeArtifact => ({
  id: 'code-value',
  path: '/src/value.ts',
  language: 'ts',
  ownership: 'code-owned',
  owner: { kind: 'workspace-module', documentId: 'code-value' },
  source,
  revision,
});

describe('TypeScript code project host', () => {
  it('leases one incremental engine per Workspace and supersedes older text', () => {
    const host = createTypeScriptCodeProjectHost();
    const first = acquireTypeScriptCodeProject(host, 'workspace-1', [
      artifact('export const value = 1;', '1'),
    ]);
    const unchanged = acquireTypeScriptCodeProject(host, 'workspace-1', [
      artifact('export const value = 1;', '1'),
    ]);

    expect(unchanged.project).toBe(first.project);
    expect(unchanged.project.service).toBe(first.project.service);
    expect(unchanged.generation).toBe(first.generation);
    expect(first.isCurrent()).toBe(true);

    const updated = acquireTypeScriptCodeProject(host, 'workspace-1', [
      artifact('export const value: string = 1;', '2'),
    ]);
    expect(updated.project).toBe(first.project);
    expect(updated.project.service).toBe(first.project.service);
    expect(updated.generation).toBe(first.generation + 1);
    expect(first.isCurrent()).toBe(false);
    expect(unchanged.isCurrent()).toBe(false);
    expect(updated.isCurrent()).toBe(true);

    first.release();
    unchanged.release();
    updated.release();
    const reopened = acquireTypeScriptCodeProject(host, 'workspace-1', [
      artifact('export const value: string = 1;', '2'),
    ]);
    expect(reopened.project).toBe(updated.project);
    expect(reopened.project.service).toBe(updated.project.service);
    reopened.release();
    disposeTypeScriptCodeProjectHost(host);
  });

  it('evicts an inactive least-recent Workspace engine at the cache bound', () => {
    const host = createTypeScriptCodeProjectHost({ maxCachedWorkspaces: 1 });
    const first = acquireTypeScriptCodeProject(host, 'workspace-1', [
      artifact('export const first = 1;', '1'),
    ]);
    first.release();

    const second = acquireTypeScriptCodeProject(host, 'workspace-2', [
      artifact('export const second = 2;', '1'),
    ]);
    expect(() =>
      first.project.updateArtifacts(first.project.artifacts)
    ).toThrow('The TypeScript code project has been disposed.');

    second.release();
    disposeTypeScriptCodeProjectHost(host);
  });
});
