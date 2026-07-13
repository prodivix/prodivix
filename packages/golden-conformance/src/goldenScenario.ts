import {
  generateWorkspaceReactViteBundle,
  type ReactExportBundle,
} from '@prodivix/prodivix-compiler';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import {
  buildGoldenExportBundle,
  type GoldenBuildEvidence,
} from './generatedProjectHarness';
import { GOLDEN_CODEGEN_POLICY } from './goldenApp.fixture';
import {
  authorGoldenWorkspace,
  type GoldenAuthoringResult,
} from './goldenAuthoring';
import {
  runGoldenSyncScenario,
  type GoldenSyncResult,
} from './goldenSyncScenario';

export {
  authorGoldenWorkspace,
  type GoldenAuthoringResult,
} from './goldenAuthoring';

export type GoldenConformanceReport = Readonly<{
  workspace: WorkspaceSnapshot;
  bundle: ReactExportBundle;
  build: GoldenBuildEvidence;
  authoring: GoldenAuthoringResult['history'] &
    Readonly<{ createdDocumentCount: number; routeCount: number }>;
  save: GoldenSyncResult['save'];
  recovery: GoldenSyncResult['recovery'];
  conflict: GoldenSyncResult['conflict'];
}>;

const countRoutes = (workspace: WorkspaceSnapshot): number => {
  const visit = (node: WorkspaceSnapshot['routeManifest']['root']): number =>
    1 + (node.children ?? []).reduce((count, child) => count + visit(child), 0);
  return visit(workspace.routeManifest.root) - 1;
};

/** Runs the complete G0 Golden chain without browser or visual checks. */
export const runGoldenConformance =
  async (): Promise<GoldenConformanceReport> => {
    const authoring = authorGoldenWorkspace();
    const sync = await runGoldenSyncScenario(authoring);
    const bundle = generateWorkspaceReactViteBundle(sync.workspace, {
      projectName: 'Prodivix Golden App',
      codegenPolicySnapshot: GOLDEN_CODEGEN_POLICY,
      packageResolver: { strategy: 'npm' },
    });
    const build = await buildGoldenExportBundle(bundle);
    return {
      workspace: sync.workspace,
      bundle,
      build,
      authoring: {
        ...authoring.history,
        createdDocumentCount:
          Object.keys(authoring.createdWorkspace.docsById).length -
          Object.keys(authoring.baseWorkspace.docsById).length,
        routeCount: countRoutes(authoring.createdWorkspace),
      },
      save: sync.save,
      recovery: sync.recovery,
      conflict: sync.conflict,
    };
  };
