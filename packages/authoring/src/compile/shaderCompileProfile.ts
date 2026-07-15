import type {
  CodeArtifactLanguage,
  ShaderCompileProfile,
  ShaderCompileStage,
  ShaderCompileTarget,
} from '../authoring.types';

export const SHADER_COMPILE_PROFILE_SCHEMA_VERSION = '1.0' as const;
export const SHADER_COMPILE_PROFILE_METADATA_KEY =
  'prodivix.shaderCompile' as const;
export const SHADER_COMPILE_TARGETS = Object.freeze([
  'webgl2',
  'webgpu',
] as const satisfies readonly ShaderCompileTarget[]);
export const SHADER_STAGES = Object.freeze([
  'vertex',
  'fragment',
  'compute',
] as const satisfies readonly ShaderCompileStage[]);

export const SHADER_COMPILE_PROFILE_ISSUE_CODES = Object.freeze({
  invalid: 'SHADER_COMPILE_PROFILE_INVALID',
  languageMismatch: 'SHADER_COMPILE_PROFILE_LANGUAGE_MISMATCH',
} as const);

export type ShaderCompileProfileIssue = Readonly<{
  code: (typeof SHADER_COMPILE_PROFILE_ISSUE_CODES)[keyof typeof SHADER_COMPILE_PROFILE_ISSUE_CODES];
  path: string;
  message: string;
}>;

export type ShaderCompileProfileResult =
  | Readonly<{ status: 'absent' }>
  | Readonly<{ status: 'valid'; profile: ShaderCompileProfile }>
  | Readonly<{
      status: 'invalid';
      issues: readonly ShaderCompileProfileIssue[];
    }>;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const isShaderStage = (value: unknown): value is ShaderCompileStage =>
  SHADER_STAGES.some((stage) => stage === value);

const isCanonicalIdentifier = (value: unknown): value is string =>
  typeof value === 'string' &&
  value === value.trim() &&
  /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value);

const invalid = (
  code: ShaderCompileProfileIssue['code'],
  path: string,
  message: string
): ShaderCompileProfileResult =>
  Object.freeze({
    status: 'invalid' as const,
    issues: Object.freeze([Object.freeze({ code, path, message })]),
  });

/** Decodes the only persisted shader target contract used by authoring. */
export const decodeShaderCompileProfile = (
  metadata: Readonly<Record<string, unknown>> | undefined,
  language: CodeArtifactLanguage
): ShaderCompileProfileResult => {
  const value = metadata?.[SHADER_COMPILE_PROFILE_METADATA_KEY];
  if (value === undefined) return Object.freeze({ status: 'absent' as const });
  const basePath = `/${SHADER_COMPILE_PROFILE_METADATA_KEY}`;
  if (!isRecord(value)) {
    return invalid(
      SHADER_COMPILE_PROFILE_ISSUE_CODES.invalid,
      basePath,
      'Shader compile profile must be an object.'
    );
  }
  if (value.schemaVersion !== SHADER_COMPILE_PROFILE_SCHEMA_VERSION) {
    return invalid(
      SHADER_COMPILE_PROFILE_ISSUE_CODES.invalid,
      `${basePath}/schemaVersion`,
      'Shader compile profile must use schema version 1.0.'
    );
  }
  if (value.target === 'webgl2') {
    if (language !== 'glsl') {
      return invalid(
        SHADER_COMPILE_PROFILE_ISSUE_CODES.languageMismatch,
        `${basePath}/target`,
        'The WebGL 2 compile target requires a GLSL artifact.'
      );
    }
    if (value.stage !== 'vertex' && value.stage !== 'fragment') {
      return invalid(
        SHADER_COMPILE_PROFILE_ISSUE_CODES.invalid,
        `${basePath}/stage`,
        'A WebGL 2 compile profile requires vertex or fragment stage.'
      );
    }
    return Object.freeze({
      status: 'valid' as const,
      profile: Object.freeze({
        schemaVersion: SHADER_COMPILE_PROFILE_SCHEMA_VERSION,
        target: 'webgl2' as const,
        stage: value.stage,
      }),
    });
  }
  if (value.target !== 'webgpu') {
    return invalid(
      SHADER_COMPILE_PROFILE_ISSUE_CODES.invalid,
      `${basePath}/target`,
      'Shader compile target must be webgl2 or webgpu.'
    );
  }
  if (language !== 'wgsl') {
    return invalid(
      SHADER_COMPILE_PROFILE_ISSUE_CODES.languageMismatch,
      `${basePath}/target`,
      'The WebGPU compile target requires a WGSL artifact.'
    );
  }
  if (value.stage !== undefined && !isShaderStage(value.stage)) {
    return invalid(
      SHADER_COMPILE_PROFILE_ISSUE_CODES.invalid,
      `${basePath}/stage`,
      'WebGPU shader stage must be vertex, fragment, or compute.'
    );
  }
  if (
    value.entryPoint !== undefined &&
    !isCanonicalIdentifier(value.entryPoint)
  ) {
    return invalid(
      SHADER_COMPILE_PROFILE_ISSUE_CODES.invalid,
      `${basePath}/entryPoint`,
      'WebGPU entry point must be a canonical shader identifier.'
    );
  }
  return Object.freeze({
    status: 'valid' as const,
    profile: Object.freeze({
      schemaVersion: SHADER_COMPILE_PROFILE_SCHEMA_VERSION,
      target: 'webgpu' as const,
      ...(value.stage ? { stage: value.stage as ShaderCompileStage } : {}),
      ...(value.entryPoint ? { entryPoint: value.entryPoint as string } : {}),
    }),
  });
};

export const writeShaderCompileProfile = (
  metadata: Readonly<Record<string, unknown>> | undefined,
  profile: ShaderCompileProfile | null
): Record<string, unknown> | undefined => {
  const next = { ...metadata };
  if (profile) {
    next[SHADER_COMPILE_PROFILE_METADATA_KEY] = profile;
  } else {
    delete next[SHADER_COMPILE_PROFILE_METADATA_KEY];
  }
  return Object.keys(next).length ? next : undefined;
};
