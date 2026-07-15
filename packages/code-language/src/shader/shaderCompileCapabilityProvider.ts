import {
  createCodeLanguageSnapshotIdentity,
  createCodeSourceSpanFromOffsets,
  isSameCodeLanguageSnapshotIdentity,
  type CodeArtifact,
  type CodeArtifactLanguage,
  type CodeLanguageSnapshotIdentity,
  type ShaderCompileCapabilityProvider,
  type ShaderCompileMessage,
  type ShaderCompileOutput,
  type ShaderCompileProfile,
  type ShaderCompileProviderDescriptor,
  type ShaderCompileResult,
  type ShaderCompilerBackend,
  type ShaderCompilerBackendMessage,
} from '@prodivix/authoring';
import { createShaderLanguageProject } from './shaderLanguageProject';

const MAX_MESSAGES = 32;
const MAX_MESSAGE_LENGTH = 600;

const sanitizeCompileText = (value: string): string => {
  const sanitized = value
    .replaceAll(/file:\/\/\/[\S]+/giu, '<source>')
    .replaceAll(/[A-Za-z]:[\\/](?:[^\\/\s:]+[\\/])*[^\\/\s:]+/gu, '<source>')
    .replaceAll(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '')
    .replaceAll(/\s+/gu, ' ')
    .trim();
  if (sanitized.length <= MAX_MESSAGE_LENGTH) return sanitized;
  return `${sanitized.slice(0, MAX_MESSAGE_LENGTH - 1)}…`;
};

const getLineStartOffset = (source: string, requestedLine: number): number => {
  const line = Math.max(1, Math.trunc(requestedLine));
  let currentLine = 1;
  let offset = 0;
  while (currentLine < line && offset < source.length) {
    const newline = source.indexOf('\n', offset);
    if (newline < 0) return source.length;
    offset = newline + 1;
    currentLine += 1;
  }
  return offset;
};

const resolveMessageOffsets = (
  artifact: CodeArtifact,
  message: ShaderCompilerBackendMessage
): Readonly<{ from: number; to: number }> | null => {
  const sourceLength = artifact.source.length;
  if (
    Number.isSafeInteger(message.offset) &&
    message.offset !== undefined &&
    message.offset >= 0 &&
    message.offset <= sourceLength
  ) {
    const length =
      Number.isSafeInteger(message.length) &&
      message.length !== undefined &&
      message.length > 0
        ? message.length
        : 1;
    return Object.freeze({
      from: message.offset,
      to: Math.min(sourceLength, message.offset + length),
    });
  }
  if (!Number.isSafeInteger(message.line) || !message.line) return null;
  const lineStart = getLineStartOffset(artifact.source, message.line);
  const nextLine = artifact.source.indexOf('\n', lineStart);
  const lineEnd = nextLine < 0 ? sourceLength : nextLine;
  const requestedColumn = Number.isSafeInteger(message.column)
    ? Math.max(1, message.column ?? 1)
    : 1;
  const from = Math.min(lineEnd, lineStart + requestedColumn - 1);
  const length =
    Number.isSafeInteger(message.length) &&
    message.length !== undefined &&
    message.length > 0
      ? message.length
      : 1;
  return Object.freeze({ from, to: Math.min(lineEnd, from + length) });
};

const normalizeMessage = (input: {
  artifact: CodeArtifact;
  message: ShaderCompilerBackendMessage;
}): ShaderCompileMessage => {
  const offsets = resolveMessageOffsets(input.artifact, input.message);
  const sourceSpan = offsets
    ? createCodeSourceSpanFromOffsets({
        artifactId: input.artifact.id,
        source: input.artifact.source,
        ...offsets,
      })
    : null;
  return Object.freeze({
    severity: input.message.severity,
    message:
      sanitizeCompileText(input.message.message) ||
      'The shader compiler reported an error without a message.',
    ...(sourceSpan ? { sourceSpan } : {}),
    ...(input.message.upstreamCode
      ? { upstreamCode: sanitizeCompileText(input.message.upstreamCode) }
      : {}),
  });
};

const createDiagnostic = (input: {
  artifact: CodeArtifact;
  profile: ShaderCompileProfile;
  message: ShaderCompileMessage;
}): ShaderCompileOutput['diagnostics'][number] =>
  Object.freeze({
    code: 'COD-5002',
    severity: 'error' as const,
    domain: 'code' as const,
    message: input.message.message,
    hint: 'Correct the shader source for the configured target and save again.',
    retryable: false,
    docsUrl: '/reference/diagnostics/cod-5002',
    targetRef: Object.freeze({
      kind: 'code-artifact' as const,
      artifactId: input.artifact.id,
    }),
    ...(input.message.sourceSpan
      ? { sourceSpan: input.message.sourceSpan }
      : {}),
    meta: {
      language: input.artifact.language,
      path: input.artifact.path,
      stage: 'compile',
      target: input.profile.target,
      ...(input.profile.stage ? { shaderStage: input.profile.stage } : {}),
      ...('entryPoint' in input.profile && input.profile.entryPoint
        ? { entryPoint: input.profile.entryPoint }
        : {}),
      ...(input.message.upstreamCode
        ? { upstreamCode: input.message.upstreamCode }
        : {}),
    },
  });

const unavailable = (
  snapshotIdentity: CodeLanguageSnapshotIdentity,
  reason?: string
): ShaderCompileResult =>
  Object.freeze({
    status: 'unavailable' as const,
    snapshotIdentity,
    ...(reason ? { reason: sanitizeCompileText(reason) } : {}),
  });

/** Wraps an injected target compiler without adding it to Language Service. */
export const createShaderCompileCapabilityProvider = (input: {
  backend: ShaderCompilerBackend;
  providerId?: string;
  version?: string;
  configurationDigest?: string;
}): ShaderCompileCapabilityProvider => {
  const language: Extract<CodeArtifactLanguage, 'glsl' | 'wgsl'> =
    input.backend.target === 'webgl2' ? 'glsl' : 'wgsl';
  const descriptor: ShaderCompileProviderDescriptor = Object.freeze({
    id: input.providerId ?? `shader-compile:${input.backend.id}`,
    version: input.version ?? '1.0.0',
    ...(input.configurationDigest
      ? { configurationDigest: input.configurationDigest }
      : {}),
    languageIds: Object.freeze([language]),
    targets: Object.freeze([input.backend.target]),
  });

  return Object.freeze({
    descriptor,
    async openSession(snapshot) {
      const snapshotIdentity = createCodeLanguageSnapshotIdentity(snapshot);
      const artifactsById = new Map(
        snapshot.artifacts.map((artifact) => [artifact.id, artifact])
      );
      const shaderProject = createShaderLanguageProject({
        workspaceId: snapshot.identity.workspaceRevisions.workspaceId,
        artifacts: snapshot.artifacts,
      });
      let disposed = false;

      return Object.freeze({
        descriptor,
        snapshotIdentity,
        async compile(request): Promise<ShaderCompileResult> {
          if (disposed) {
            return unavailable(
              snapshotIdentity,
              'The shader compile session has been disposed.'
            );
          }
          if (
            !isSameCodeLanguageSnapshotIdentity(
              snapshotIdentity,
              request.expectedSnapshotIdentity
            )
          ) {
            return Object.freeze({
              status: 'stale' as const,
              snapshotIdentity,
              expectedSnapshotIdentity: request.expectedSnapshotIdentity,
            });
          }
          const artifact = artifactsById.get(request.artifactId);
          const profile = artifact?.shaderCompileProfile;
          if (
            !artifact ||
            !profile ||
            artifact.language !== language ||
            profile.target !== input.backend.target
          ) {
            return Object.freeze({
              status: 'missing' as const,
              snapshotIdentity,
            });
          }
          const document = shaderProject.getDocument(artifact.id);
          const canValidateProfile =
            profile.target === 'webgpu' &&
            Boolean(document && document.parseDiagnostics.length === 0);
          const entries = canValidateProfile
            ? (document?.symbols.filter(
                (symbol) => symbol.category === 'entry'
              ) ?? [])
            : [];
          const configuredEntry =
            canValidateProfile && profile.entryPoint
              ? entries.find((entry) => entry.name === profile.entryPoint)
              : undefined;
          const profileMessage: ShaderCompilerBackendMessage | null =
            canValidateProfile && profile.entryPoint && !configuredEntry
              ? {
                  severity: 'error',
                  message: `Entry point "${profile.entryPoint}" is not declared in this WGSL module.`,
                  upstreamCode: 'profile-entry-missing',
                }
              : canValidateProfile &&
                  profile.stage &&
                  configuredEntry &&
                  configuredEntry.stage !== profile.stage
                ? {
                    severity: 'error',
                    message: `Entry point "${configuredEntry.name}" is ${configuredEntry.stage ?? 'unknown'}, but the compile profile requires ${profile.stage}.`,
                    offset: configuredEntry.declaration.from,
                    length:
                      configuredEntry.declaration.to -
                      configuredEntry.declaration.from,
                    upstreamCode: 'profile-stage-mismatch',
                  }
                : canValidateProfile &&
                    profile.stage &&
                    !profile.entryPoint &&
                    !entries.some((entry) => entry.stage === profile.stage)
                  ? {
                      severity: 'error',
                      message: `The WGSL module does not declare a ${profile.stage} entry point.`,
                      upstreamCode: 'profile-stage-missing',
                    }
                  : null;
          let backendResult;
          if (profileMessage) {
            backendResult = {
              status: 'compiled' as const,
              success: false,
              messages: [profileMessage],
            };
          } else {
            try {
              backendResult = await input.backend.compile({
                artifact,
                profile,
              });
            } catch {
              return unavailable(
                snapshotIdentity,
                'The target shader compiler failed to complete.'
              );
            }
          }
          if (backendResult.status === 'unavailable') {
            return unavailable(snapshotIdentity, backendResult.reason);
          }
          const normalized = backendResult.messages
            .slice(0, MAX_MESSAGES)
            .map((message) => normalizeMessage({ artifact, message }));
          if (
            !backendResult.success &&
            !normalized.some((message) => message.severity === 'error')
          ) {
            normalized.push(
              Object.freeze({
                severity: 'error' as const,
                message: 'The target shader compiler rejected this source.',
              })
            );
          }
          const messages = Object.freeze(normalized);
          const diagnostics = Object.freeze(
            messages
              .filter((message) => message.severity === 'error')
              .map((message) =>
                createDiagnostic({ artifact, profile, message })
              )
          );
          return Object.freeze({
            status: 'resolved' as const,
            snapshotIdentity,
            value: Object.freeze({
              artifactId: artifact.id,
              target: profile.target,
              success: backendResult.success && diagnostics.length === 0,
              messages,
              diagnostics,
            }),
          });
        },
        dispose() {
          disposed = true;
        },
      });
    },
  });
};
