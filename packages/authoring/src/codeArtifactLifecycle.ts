import type {
  CodeArtifact,
  CodeSlotBindingProjection,
  CodeSlotKind,
} from './authoring.types';
import type { CodeSlotRegistry } from './codeSlotRegistry';

export const CODE_ARTIFACT_LIFECYCLE_METADATA_KEY =
  'prodivix.codeArtifactLifecycle' as const;

const CODE_SLOT_KINDS = new Set<CodeSlotKind>([
  'event-handler',
  'validator',
  'node-executor',
  'animation-function',
  'animation-script',
  'shader',
  'external-adapter',
  'mounted-css',
  'route-loader',
  'route-action',
  'route-guard',
  'route-runtime',
  'workspace-module',
]);

export type CodeArtifactLifecycleManifest = Readonly<{
  schemaVersion: '1.0';
  managedBy: 'code-slot';
  origin: Readonly<{
    slotId: string;
    slotKind: CodeSlotKind;
  }>;
}>;

export type CodeArtifactLifecycleIssue = Readonly<{
  path: string;
  message: string;
}>;

export type CodeArtifactLifecycleManifestDecodeResult =
  | Readonly<{ status: 'absent' }>
  | Readonly<{
      status: 'valid';
      manifest: CodeArtifactLifecycleManifest;
    }>
  | Readonly<{
      status: 'invalid';
      issues: readonly CodeArtifactLifecycleIssue[];
    }>;

export type CodeArtifactLifecycle =
  | Readonly<{ status: 'workspace-module' }>
  | Readonly<{
      status: 'active';
      bindings: readonly CodeSlotBindingProjection[];
      origin?: CodeArtifactLifecycleManifest['origin'];
    }>
  | Readonly<{
      status: 'orphan';
      previousSlot: CodeArtifactLifecycleManifest['origin'];
    }>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const isCodeSlotKind = (value: unknown): value is CodeSlotKind =>
  typeof value === 'string' && CODE_SLOT_KINDS.has(value as CodeSlotKind);

export const decodeCodeArtifactLifecycleManifest = (
  metadata: Readonly<Record<string, unknown>> | undefined
): CodeArtifactLifecycleManifestDecodeResult => {
  const value = metadata?.[CODE_ARTIFACT_LIFECYCLE_METADATA_KEY];
  if (value === undefined) return Object.freeze({ status: 'absent' });
  const issues: CodeArtifactLifecycleIssue[] = [];
  if (!isRecord(value)) {
    issues.push({
      path: `/${CODE_ARTIFACT_LIFECYCLE_METADATA_KEY}`,
      message: 'Code artifact lifecycle metadata must be an object.',
    });
  } else {
    if (value.schemaVersion !== '1.0') {
      issues.push({
        path: `/${CODE_ARTIFACT_LIFECYCLE_METADATA_KEY}/schemaVersion`,
        message: 'Code artifact lifecycle schemaVersion must be "1.0".',
      });
    }
    if (value.managedBy !== 'code-slot') {
      issues.push({
        path: `/${CODE_ARTIFACT_LIFECYCLE_METADATA_KEY}/managedBy`,
        message: 'Code artifact lifecycle managedBy must be "code-slot".',
      });
    }
    if (!isRecord(value.origin)) {
      issues.push({
        path: `/${CODE_ARTIFACT_LIFECYCLE_METADATA_KEY}/origin`,
        message: 'Code artifact lifecycle origin must be an object.',
      });
    } else {
      if (
        typeof value.origin.slotId !== 'string' ||
        value.origin.slotId.trim().length === 0
      ) {
        issues.push({
          path: `/${CODE_ARTIFACT_LIFECYCLE_METADATA_KEY}/origin/slotId`,
          message: 'Code artifact lifecycle origin.slotId must be non-empty.',
        });
      }
      if (!isCodeSlotKind(value.origin.slotKind)) {
        issues.push({
          path: `/${CODE_ARTIFACT_LIFECYCLE_METADATA_KEY}/origin/slotKind`,
          message: 'Code artifact lifecycle origin.slotKind is unsupported.',
        });
      }
    }
  }
  if (issues.length > 0) {
    return Object.freeze({
      status: 'invalid',
      issues: Object.freeze(issues.map((issue) => Object.freeze(issue))),
    });
  }
  const record = value as {
    schemaVersion: '1.0';
    managedBy: 'code-slot';
    origin: { slotId: string; slotKind: CodeSlotKind };
  };
  return Object.freeze({
    status: 'valid',
    manifest: Object.freeze({
      schemaVersion: record.schemaVersion,
      managedBy: record.managedBy,
      origin: Object.freeze({ ...record.origin }),
    }),
  });
};

export const writeCodeArtifactLifecycleManifest = (
  metadata: Readonly<Record<string, unknown>> | undefined,
  manifest: CodeArtifactLifecycleManifest | null
): Record<string, unknown> | undefined => {
  const next = { ...(metadata ?? {}) };
  if (manifest) {
    next[CODE_ARTIFACT_LIFECYCLE_METADATA_KEY] = {
      schemaVersion: manifest.schemaVersion,
      managedBy: manifest.managedBy,
      origin: { ...manifest.origin },
    };
  } else {
    delete next[CODE_ARTIFACT_LIFECYCLE_METADATA_KEY];
  }
  return Object.keys(next).length > 0 ? next : undefined;
};

export const createCodeArtifactLifecycleManifest = (input: {
  slotId: string;
  slotKind: CodeSlotKind;
}): CodeArtifactLifecycleManifest =>
  Object.freeze({
    schemaVersion: '1.0',
    managedBy: 'code-slot',
    origin: Object.freeze({
      slotId: input.slotId,
      slotKind: input.slotKind,
    }),
  });

/** Derives lifecycle from canonical metadata and revision-bound bindings. */
export const resolveCodeArtifactLifecycle = (input: {
  artifact: CodeArtifact;
  registry: CodeSlotRegistry;
}): CodeArtifactLifecycle => {
  const bindings = Object.freeze(
    input.registry.listBindingProjectionsByArtifact(input.artifact.id)
  );
  if (bindings.length > 0) {
    return Object.freeze({
      status: 'active',
      bindings,
      ...(input.artifact.lifecycleManifest
        ? { origin: input.artifact.lifecycleManifest.origin }
        : {}),
    });
  }
  if (input.artifact.lifecycleManifest) {
    return Object.freeze({
      status: 'orphan',
      previousSlot: input.artifact.lifecycleManifest.origin,
    });
  }
  return Object.freeze({ status: 'workspace-module' });
};
