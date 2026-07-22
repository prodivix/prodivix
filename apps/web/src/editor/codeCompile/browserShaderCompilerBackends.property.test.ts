import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createBrowserWebGl2ShaderCompilerBackend,
  parseWebGlShaderCompileLog,
} from './browserShaderCompilerBackends';

describe('browser shader compiler backend properties', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes WebGL line diagnostics without changing their severity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,79}$/u),
        (line, message) => {
          expect(
            parseWebGlShaderCompileLog(`ERROR: 0:${line}: ${message}`)
          ).toEqual([
            {
              severity: 'error',
              message: message.trim(),
              line,
            },
          ]);
        }
      )
    );
  });

  it('reuses one live WebGL context across compilations', async () => {
    const shader = {} as WebGLShader;
    const context = {
      VERTEX_SHADER: 0x8b31,
      FRAGMENT_SHADER: 0x8b30,
      COMPILE_STATUS: 0x8b81,
      isContextLost: vi.fn(() => false),
      createShader: vi.fn(() => shader),
      shaderSource: vi.fn(),
      compileShader: vi.fn(),
      getShaderParameter: vi.fn(() => true),
      getShaderInfoLog: vi.fn(() => ''),
      deleteShader: vi.fn(),
    } as unknown as WebGL2RenderingContext;
    const getContext = vi.fn(() => context);
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockReturnValue({ getContext } as unknown as HTMLCanvasElement);
    const backend = createBrowserWebGl2ShaderCompilerBackend();
    const input = {
      artifact: {
        id: 'shader',
        path: '/shader.glsl',
        language: 'glsl' as const,
        ownership: 'code-owned' as const,
        owner: { kind: 'workspace-module' as const, documentId: 'shader' },
        source: 'void main() {}',
        revision: '1',
      },
      profile: {
        schemaVersion: '1.0' as const,
        target: 'webgl2' as const,
        stage: 'vertex' as const,
      },
    };

    await backend.compile(input);
    await backend.compile(input);

    expect(createElement).toHaveBeenCalledTimes(1);
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(context.createShader).toHaveBeenCalledTimes(2);
  });
});
