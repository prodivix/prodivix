import type { CodeArtifact } from '@prodivix/authoring';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createShaderSemanticContribution } from '.';

const artifacts: readonly CodeArtifact[] = [
  {
    id: 'code-glsl',
    path: '/shaders/main.glsl',
    language: 'glsl',
    owner: { kind: 'workspace-module', documentId: 'code-glsl' },
    source: 'float wave(float x) { return sin(x); } void main() { wave(1.0); }',
    revision: '2',
  },
  {
    id: 'code-wgsl',
    path: '/shaders/main.wgsl',
    language: 'wgsl',
    owner: { kind: 'workspace-module', documentId: 'code-wgsl' },
    source:
      'fn wave(x: f32) -> f32 { return sin(x); } @compute @workgroup_size(1) fn main() { let value = wave(1.0); }',
    revision: '3',
  },
];

describe('Shader semantic contribution properties', () => {
  it('is invariant to GLSL/WGSL artifact input order', () => {
    const expected = createShaderSemanticContribution({
      workspaceId: 'workspace-shader-order',
      artifacts,
    });

    fc.assert(
      fc.property(fc.boolean(), (reverse) => {
        expect(
          createShaderSemanticContribution({
            workspaceId: 'workspace-shader-order',
            artifacts: reverse ? [...artifacts].reverse() : [...artifacts],
          })
        ).toEqual(expected);
      }),
      { numRuns: 8 }
    );
  });
});
