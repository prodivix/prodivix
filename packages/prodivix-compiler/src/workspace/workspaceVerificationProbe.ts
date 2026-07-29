import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import type {
  ExportModule,
  ExportProgramContribution,
  ExportProgramMetadata,
  ExportSourceTrace,
} from '#src/export/types';
import {
  WORKSPACE_VERIFICATION_PROBE_MODULE_ID,
  WORKSPACE_VERIFICATION_PROBE_MODULE_PATH,
  type WorkspaceVerificationCompileProfile,
  type WorkspaceVerificationProbeMetadata,
  type WorkspaceVerificationProbeTarget,
} from '#src/workspace/workspaceVerificationProbeContract';
import {
  digestNormalizedWorkspaceVerificationProbeManifest,
  normalizeWorkspaceVerificationCompileProfile,
} from '#src/workspace/workspaceVerificationProbeProfile';
import { createWorkspaceVerificationProbeRuntimeSource } from '#src/workspace/workspaceVerificationProbeRuntime';

export {
  PRODUCTION_WORKSPACE_VERIFICATION_COMPILE_PROFILE,
  WORKSPACE_VERIFICATION_PROBE_CANARY,
  WORKSPACE_VERIFICATION_PROBE_ENDPOINT,
  WORKSPACE_VERIFICATION_PROBE_MODULE_ID,
  WORKSPACE_VERIFICATION_PROBE_MODULE_PATH,
  WorkspaceVerificationCompileProfileError,
  type WorkspaceVerificationCompileProfile,
  type WorkspaceVerificationProbeMetadata,
  type WorkspaceVerificationProbeInstanceScope,
  type WorkspaceVerificationProbeReadiness,
  type WorkspaceVerificationProbeSourceRef,
  type WorkspaceVerificationProbeTarget,
} from '#src/workspace/workspaceVerificationProbeContract';

const sourceTracesForTargets = (
  targets: readonly WorkspaceVerificationProbeTarget[]
): ExportSourceTrace[] => {
  const traces = new Map<string, ExportSourceTrace>();
  targets.forEach(({ sourceRef }) => {
    const key = `${sourceRef.workspaceDocumentId}\u0000${sourceRef.path}`;
    traces.set(key, {
      sourceRef: {
        domain: 'workspace-document',
        id: sourceRef.workspaceDocumentId,
        path: sourceRef.path,
      },
      ownerRootId: 'app',
    });
  });
  return [...traces.entries()]
    .sort(([left], [right]) => compareUnicodeCodePoints(left, right))
    .map(([, trace]) => trace);
};

/**
 * Creates the only verification-only compiler contribution. Production is a
 * literal empty contribution, so no endpoint, module id, path, metadata key,
 * or canary can reach production ExportProgram bytes.
 */
export const createWorkspaceVerificationProbeContribution = (
  workspace: WorkspaceSnapshot,
  profile: WorkspaceVerificationCompileProfile | undefined
): ExportProgramContribution => {
  const normalized = normalizeWorkspaceVerificationCompileProfile(
    workspace,
    profile
  );
  if (normalized.kind === 'production') return Object.freeze({});

  const manifestDigest =
    digestNormalizedWorkspaceVerificationProbeManifest(normalized);
  const metadata: WorkspaceVerificationProbeMetadata = Object.freeze({
    format: 'prodivix.workspace-verification-probe.v1',
    workspaceRevision: normalized.workspaceRevision,
    profileDigest: normalized.profileDigest,
    scenarioProgramDigest: normalized.scenarioProgramDigest,
    semanticSnapshotDigest: normalized.semanticSnapshotDigest,
    manifestDigest,
    targetCount: normalized.targets.length,
  });
  const module: ExportModule = {
    id: WORKSPACE_VERIFICATION_PROBE_MODULE_ID,
    kind: 'runtime-helper',
    ownerRootId: 'app',
    suggestedName: 'prodivix-verification-probe',
    desiredPath: WORKSPACE_VERIFICATION_PROBE_MODULE_PATH,
    language: 'ts',
    imports: [],
    body: createWorkspaceVerificationProbeRuntimeSource(
      normalized,
      manifestDigest
    ),
    sourceTrace: sourceTracesForTargets(normalized.targets),
    origin: {
      kind: 'generated',
      owner: 'prodivix',
      label: 'Verification-only semantic probe',
      writePolicy: 'generated',
      updatePolicy: 'regenerate',
    },
  };
  const contributionMetadata: ExportProgramMetadata = {
    workspaceVerificationProbe: metadata,
  };
  return {
    modules: Object.freeze([module]),
    metadata: Object.freeze(contributionMetadata),
  } as ExportProgramContribution;
};

/**
 * Makes the verification module executable through the existing framework
 * entry module. The import uses semantic module identity, so both React and
 * Vue resolve it through the same ExportProgram planner contract.
 */
export const attachWorkspaceVerificationProbeToEntryModule = (
  entryModule: ExportModule,
  contribution: ExportProgramContribution
): ExportModule => {
  const probeModule = contribution.modules?.find(
    (module) => module.id === WORKSPACE_VERIFICATION_PROBE_MODULE_ID
  );
  if (!probeModule) return entryModule;
  return {
    ...entryModule,
    imports: [
      ...entryModule.imports,
      {
        kind: 'side-effect',
        source: probeModule.id,
        targetModuleId: probeModule.id,
      },
    ],
  };
};
