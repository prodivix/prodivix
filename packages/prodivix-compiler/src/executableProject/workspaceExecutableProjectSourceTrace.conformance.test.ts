import { describe, expect, it } from 'vitest';
import { executionSourceTrace } from './workspaceExecutableProject';

describe('Workspace executable SourceTrace labels', () => {
  it('namespaces a canonical Workspace pointer while preserving navigation identity', () => {
    const trace = executionSourceTrace(
      {
        sourceRef: {
          domain: 'route',
          id: 'route-catalog',
          path: '/routeManifest/runtime/route-catalog/loader',
        },
        artifactId: 'route-loader-catalog',
        sourceSpan: {
          startLine: 3,
          startColumn: 5,
          endLine: 7,
          endColumn: 9,
        },
      },
      'workspace-catalog'
    );

    expect(trace).toEqual({
      sourceRef: {
        kind: 'route',
        routeId: 'route-catalog',
      },
      sourceSpan: {
        artifactId: 'route-loader-catalog',
        startLine: 3,
        startColumn: 5,
        endLine: 7,
        endColumn: 9,
      },
      label: 'route:/routeManifest/runtime/route-catalog/loader',
    });
  });
});
