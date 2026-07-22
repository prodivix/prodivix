import type {
  ShaderCompilerBackend,
  ShaderCompilerBackendMessage,
  ShaderCompilerBackendResult,
} from '@prodivix/authoring';

const parseWebGlLogLine = (
  value: string,
  fallbackSeverity: 'warning' | 'error'
): ShaderCompilerBackendMessage | null => {
  const line = value.trim();
  if (!line) return null;
  const webGl = /^(ERROR|WARNING):\s*\d+:(\d+)(?::(\d+))?:\s*(.*)$/iu.exec(
    line
  );
  if (webGl) {
    return Object.freeze({
      severity: webGl[1]?.toLowerCase() === 'warning' ? 'warning' : 'error',
      message: webGl[4]?.trim() || line,
      line: Number(webGl[2]),
      ...(webGl[3] ? { column: Number(webGl[3]) } : {}),
    });
  }
  const angle =
    /^\d+\((\d+)\)\s*:\s*(error|warning)\s*([^:]*):?\s*(.*)$/iu.exec(line);
  if (angle) {
    return Object.freeze({
      severity: angle[2]?.toLowerCase() === 'warning' ? 'warning' : 'error',
      message: [angle[3]?.trim(), angle[4]?.trim()].filter(Boolean).join(': '),
      line: Number(angle[1]),
    });
  }
  return Object.freeze({
    severity: /warning/iu.test(line) ? 'warning' : fallbackSeverity,
    message: line,
  });
};

export const parseWebGlShaderCompileLog = (
  log: string,
  fallbackSeverity: 'warning' | 'error' = 'error'
): readonly ShaderCompilerBackendMessage[] =>
  Object.freeze(
    log
      .split(/\r?\n/u)
      .map((line) => parseWebGlLogLine(line, fallbackSeverity))
      .filter((message): message is ShaderCompilerBackendMessage =>
        Boolean(message)
      )
  );

export const createBrowserWebGl2ShaderCompilerBackend =
  (): ShaderCompilerBackend => {
    let context: WebGL2RenderingContext | null = null;
    const getContext = (): WebGL2RenderingContext | null => {
      if (context && !context.isContextLost()) return context;
      context = document
        .createElement('canvas')
        .getContext('webgl2', { failIfMajorPerformanceCaveat: false });
      return context;
    };

    return Object.freeze({
      id: 'browser-webgl2',
      target: 'webgl2' as const,
      async compile({
        artifact,
        profile,
      }): Promise<ShaderCompilerBackendResult> {
        if (profile.target !== 'webgl2') {
          return Object.freeze({
            status: 'unavailable' as const,
            reason: 'The WebGL 2 backend received an incompatible profile.',
          });
        }
        if (typeof document === 'undefined') {
          return Object.freeze({
            status: 'unavailable' as const,
            reason: 'WebGL 2 is unavailable outside a browser document.',
          });
        }
        const compilerContext = getContext();
        if (!compilerContext) {
          return Object.freeze({
            status: 'unavailable' as const,
            reason: 'This browser does not provide a WebGL 2 compiler.',
          });
        }
        const shader = compilerContext.createShader(
          profile.stage === 'vertex'
            ? compilerContext.VERTEX_SHADER
            : compilerContext.FRAGMENT_SHADER
        );
        if (!shader) {
          return Object.freeze({
            status: 'unavailable' as const,
            reason: 'WebGL 2 could not allocate a shader compiler object.',
          });
        }
        try {
          compilerContext.shaderSource(shader, artifact.source);
          compilerContext.compileShader(shader);
          const success =
            compilerContext.getShaderParameter(
              shader,
              compilerContext.COMPILE_STATUS
            ) === true;
          const log = compilerContext.getShaderInfoLog(shader) ?? '';
          return Object.freeze({
            status: 'compiled' as const,
            success,
            messages: parseWebGlShaderCompileLog(
              log,
              success ? 'warning' : 'error'
            ),
          });
        } finally {
          compilerContext.deleteShader(shader);
        }
      },
    });
  };

type BrowserGpuCompilationMessage = Readonly<{
  type: 'error' | 'warning' | 'info';
  message: string;
  offset?: number;
  length?: number;
  lineNum?: number;
  linePos?: number;
}>;

type BrowserGpuShaderModule = Readonly<{
  getCompilationInfo(): Promise<
    Readonly<{ messages: readonly BrowserGpuCompilationMessage[] }>
  >;
}>;

type BrowserGpuDevice = Readonly<{
  createShaderModule(
    descriptor: Readonly<{
      code: string;
      label?: string;
    }>
  ): BrowserGpuShaderModule;
}>;

type BrowserGpuAdapter = Readonly<{
  requestDevice(): Promise<BrowserGpuDevice>;
}>;

type BrowserGpu = Readonly<{
  requestAdapter(): Promise<BrowserGpuAdapter | null>;
}>;

const getBrowserGpu = (): BrowserGpu | null => {
  if (typeof navigator === 'undefined') return null;
  const candidate = (navigator as Navigator & { gpu?: BrowserGpu }).gpu;
  return candidate ?? null;
};

export const createBrowserWebGpuShaderCompilerBackend =
  (): ShaderCompilerBackend => {
    let devicePromise: Promise<BrowserGpuDevice | null> | null = null;
    const getDevice = (): Promise<BrowserGpuDevice | null> => {
      if (devicePromise) return devicePromise;
      const gpu = getBrowserGpu();
      if (!gpu) return Promise.resolve(null);
      devicePromise = gpu
        .requestAdapter()
        .then((adapter) => (adapter ? adapter.requestDevice() : null))
        .catch(() => null);
      return devicePromise;
    };

    return Object.freeze({
      id: 'browser-webgpu',
      target: 'webgpu' as const,
      async compile({
        artifact,
        profile,
      }): Promise<ShaderCompilerBackendResult> {
        if (profile.target !== 'webgpu') {
          return Object.freeze({
            status: 'unavailable' as const,
            reason: 'The WebGPU backend received an incompatible profile.',
          });
        }
        const device = await getDevice();
        if (!device) {
          return Object.freeze({
            status: 'unavailable' as const,
            reason: 'This browser does not provide an available WebGPU device.',
          });
        }
        try {
          const module = device.createShaderModule({
            code: artifact.source,
            label: artifact.path,
          });
          const compilationInfo = await module.getCompilationInfo();
          const messages = Object.freeze(
            compilationInfo.messages.map((message) =>
              Object.freeze({
                severity: message.type,
                message: message.message,
                ...(Number.isSafeInteger(message.offset)
                  ? { offset: message.offset }
                  : {}),
                ...(Number.isSafeInteger(message.length)
                  ? { length: message.length }
                  : {}),
                ...(Number.isSafeInteger(message.lineNum)
                  ? { line: message.lineNum }
                  : {}),
                ...(Number.isSafeInteger(message.linePos)
                  ? { column: message.linePos }
                  : {}),
              })
            )
          );
          return Object.freeze({
            status: 'compiled' as const,
            success: !messages.some((message) => message.severity === 'error'),
            messages,
          });
        } catch {
          return Object.freeze({
            status: 'unavailable' as const,
            reason: 'The WebGPU compiler failed to produce compilation info.',
          });
        }
      },
    });
  };
