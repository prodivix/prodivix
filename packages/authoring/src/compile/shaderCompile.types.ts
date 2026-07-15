import type { ProdivixDiagnostic, SourceSpan } from '@prodivix/diagnostics';
import type {
  CodeArtifact,
  CodeArtifactLanguage,
  ShaderCompileProfile,
  ShaderCompileTarget,
} from '../authoring.types';
import type {
  CodeLanguageSnapshot,
  CodeLanguageSnapshotIdentity,
} from '../language/codeLanguage.types';

export type ShaderCompileMessageSeverity = 'info' | 'warning' | 'error';

export type ShaderCompileMessage = Readonly<{
  severity: ShaderCompileMessageSeverity;
  message: string;
  sourceSpan?: SourceSpan;
  upstreamCode?: string;
}>;

export type ShaderCompileOutput = Readonly<{
  artifactId: string;
  target: ShaderCompileTarget;
  success: boolean;
  messages: readonly ShaderCompileMessage[];
  diagnostics: readonly ProdivixDiagnostic[];
}>;

export type ShaderCompileResolvedResult = Readonly<{
  status: 'resolved';
  snapshotIdentity: CodeLanguageSnapshotIdentity;
  value: ShaderCompileOutput;
}>;

export type ShaderCompileMissingResult = Readonly<{
  status: 'missing';
  snapshotIdentity: CodeLanguageSnapshotIdentity;
}>;

export type ShaderCompileStaleResult = Readonly<{
  status: 'stale';
  snapshotIdentity: CodeLanguageSnapshotIdentity;
  expectedSnapshotIdentity: CodeLanguageSnapshotIdentity;
}>;

export type ShaderCompileUnavailableResult = Readonly<{
  status: 'unavailable';
  snapshotIdentity: CodeLanguageSnapshotIdentity;
  reason?: string;
}>;

export type ShaderCompileResult =
  | ShaderCompileResolvedResult
  | ShaderCompileMissingResult
  | ShaderCompileStaleResult
  | ShaderCompileUnavailableResult;

export type ShaderCompileRequest = Readonly<{
  expectedSnapshotIdentity: CodeLanguageSnapshotIdentity;
  artifactId: string;
}>;

export type ShaderCompileProviderDescriptor = Readonly<{
  id: string;
  version: string;
  configurationDigest?: string;
  languageIds: readonly CodeArtifactLanguage[];
  targets: readonly ShaderCompileTarget[];
}>;

export type ShaderCompileSession = Readonly<{
  descriptor: ShaderCompileProviderDescriptor;
  snapshotIdentity: CodeLanguageSnapshotIdentity;
  compile(request: ShaderCompileRequest): Promise<ShaderCompileResult>;
  dispose(): void;
}>;

export type ShaderCompileCapabilityProvider = Readonly<{
  descriptor: ShaderCompileProviderDescriptor;
  openSession(snapshot: CodeLanguageSnapshot): Promise<ShaderCompileSession>;
}>;

export type ShaderCompilerBackendMessage = Readonly<{
  severity: ShaderCompileMessageSeverity;
  message: string;
  offset?: number;
  length?: number;
  line?: number;
  column?: number;
  upstreamCode?: string;
}>;

export type ShaderCompilerBackendResult =
  | Readonly<{
      status: 'compiled';
      success: boolean;
      messages: readonly ShaderCompilerBackendMessage[];
    }>
  | Readonly<{ status: 'unavailable'; reason?: string }>;

export type ShaderCompilerBackend = Readonly<{
  id: string;
  target: ShaderCompileTarget;
  compile(
    input: Readonly<{
      artifact: CodeArtifact;
      profile: ShaderCompileProfile;
    }>
  ): Promise<ShaderCompilerBackendResult>;
}>;
