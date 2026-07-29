import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  digestVerificationValue,
  type VerificationPlan,
} from '@prodivix/verification';
import { createBrowserVerificationRuntimeEnvironmentDigest } from '@prodivix/verification-browser';
import {
  assertGoldenControlledStaticToolchainAuthorityReceipt,
  type GoldenControlledStaticToolchainAuthorityReceipt,
} from './generatedProjectToolchain';
import type { GoldenG3V6BrowserAttempt } from './goldenG3V6BrowserAttemptExecution';
import {
  GOLDEN_G3_V6_BROWSER_IDENTITY_REGISTRY_DIGEST,
  assertGoldenG3V6BrowserIdentityRegistry,
  createGoldenG3V6BrowserRuntimeIdentity,
  createGoldenG3V6ControlledBrowserImageIdentities,
  createGoldenG3V6SelectedPlatformIdentity,
} from './goldenG3V6BrowserIdentityFixture';
import type { GoldenG3V6FrameworkTarget } from './goldenG3V6BrowserMatrixProjects';
import type { GoldenG3V6StaticAdapterAttempt } from './goldenG3V6StaticAdapterExecution';
import type { GoldenG3V6StaticToolchainEvidence } from './goldenG3V6StaticAdapterInputs';

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;

export type GoldenG3V6StaticRuntimeEnvironmentEvidence = Readonly<{
  format: 'prodivix.golden-g3-v6-static-runtime-environment';
  version: 1;
  frameworkTarget: GoldenG3V6FrameworkTarget;
  selectedPlatformDigest: string;
  executableSnapshotDigest: string;
  toolchainAuthorityReceiptDigest: string;
  sandboxProvider: 'windows-appcontainer' | 'linux-rootless-podman';
  rootFilesystem: 'appcontainer-lowbox' | 'read-only';
  networkMode: 'none';
  liveEgressAttemptCount: number;
  liveEgressSuccessCount: 0;
  hostMountCount: 0;
  installEnvironmentDigest: string;
  executionEnvironmentDigest: string;
  nodeVersion: '22.23.1';
  nodeBinaryDigest: string;
  pnpmVersion: '11.9.0';
  typescriptVersion: string;
  vitestVersion: string;
  viteVersion: string;
  rollupVersion: '4.62.3';
  rollupImplementation: '@rollup/wasm-node';
  rollupAliasSpec: 'npm:@rollup/wasm-node@4.62.3';
  esbuildVersion: '0.27.7';
  esbuildImplementation: 'esbuild-wasm';
  esbuildAliasSpec: 'npm:esbuild-wasm@0.27.7';
  manifestDigest: string;
  lockDigest: string;
  toolchainFileSetDigest: string;
  environmentDigest: string;
}>;

export type GoldenG3V6ControlledEnvironmentAttemptBinding = Readonly<{
  attemptId: string;
  executionBoundary: 'browser' | 'node';
  runtimeEnvironmentDigest: string;
}>;

export type GoldenG3V6ControlledEnvironmentEvidence = Readonly<{
  format: 'prodivix.golden-g3-v6-controlled-environment-evidence';
  version: 1;
  selectedPlatform: ReturnType<typeof createGoldenG3V6SelectedPlatformIdentity>;
  selectedPlatformDigest: string;
  browserIdentityRegistryDigest: string;
  browserImages: ReturnType<
    typeof createGoldenG3V6ControlledBrowserImageIdentities
  >;
  staticRuntimeEnvironments: readonly GoldenG3V6StaticRuntimeEnvironmentEvidence[];
  attemptBindings: readonly GoldenG3V6ControlledEnvironmentAttemptBinding[];
  browserAttemptCount: 72;
  staticAttemptCount: 8;
  nodeVersion: '22.23.1';
  pnpmVersion: '11.9.0';
  evidenceDigest: string;
}>;

export const createGoldenG3V6StaticRuntimeEnvironmentEvidence = (input: {
  frameworkTarget: GoldenG3V6FrameworkTarget;
  executableSnapshotDigest: string;
  authorityReceipt: GoldenControlledStaticToolchainAuthorityReceipt;
}): GoldenG3V6StaticRuntimeEnvironmentEvidence => {
  assertGoldenG3V6BrowserIdentityRegistry();
  assertGoldenControlledStaticToolchainAuthorityReceipt(input.authorityReceipt);
  const selectedPlatform = createGoldenG3V6SelectedPlatformIdentity();
  const selectedPlatformDigest = digestVerificationValue(selectedPlatform);
  const expectedProvider =
    selectedPlatform.platform === 'win32'
      ? ('windows-appcontainer' as const)
      : ('linux-rootless-podman' as const);
  const expectedRootFilesystem =
    expectedProvider === 'windows-appcontainer'
      ? ('appcontainer-lowbox' as const)
      : ('read-only' as const);
  const receipt = input.authorityReceipt;
  if (
    !DIGEST_PATTERN.test(input.executableSnapshotDigest) ||
    receipt.snapshotDigest !== input.executableSnapshotDigest ||
    receipt.provider !== expectedProvider ||
    receipt.isolation.provider !== expectedProvider ||
    receipt.isolation.rootFilesystem !== expectedRootFilesystem
  ) {
    throw new Error(
      `Golden V6 ${input.frameworkTarget} static runtime environment is not bound to the selected platform and snapshot.`
    );
  }
  const identity = Object.freeze({
    format: 'prodivix.golden-g3-v6-static-runtime-environment' as const,
    version: 1 as const,
    frameworkTarget: input.frameworkTarget,
    selectedPlatformDigest,
    executableSnapshotDigest: input.executableSnapshotDigest,
    toolchainAuthorityReceiptDigest: receipt.receiptDigest,
    sandboxProvider: expectedProvider,
    rootFilesystem: expectedRootFilesystem,
    networkMode: 'none' as const,
    liveEgressAttemptCount: receipt.isolation.liveEgressAttemptCount,
    liveEgressSuccessCount: 0 as const,
    hostMountCount: 0 as const,
    installEnvironmentDigest: receipt.environment.install.digest,
    executionEnvironmentDigest: receipt.environment.execution.digest,
    nodeVersion: '22.23.1' as const,
    nodeBinaryDigest: receipt.toolchain.nodeBinaryDigest,
    pnpmVersion: '11.9.0' as const,
    typescriptVersion: receipt.toolchain.typescriptVersion,
    vitestVersion: receipt.toolchain.vitestVersion,
    viteVersion: receipt.toolchain.viteVersion,
    rollupVersion: receipt.toolchain.rollupVersion,
    rollupImplementation: receipt.toolchain.rollupImplementation,
    rollupAliasSpec: receipt.toolchain.rollupAliasSpec,
    esbuildVersion: receipt.toolchain.esbuildVersion,
    esbuildImplementation: receipt.toolchain.esbuildImplementation,
    esbuildAliasSpec: receipt.toolchain.esbuildAliasSpec,
    manifestDigest: receipt.toolchain.manifestDigest,
    lockDigest: receipt.toolchain.lockDigest,
    toolchainFileSetDigest: receipt.toolchain.toolchainFileSetDigest,
  });
  return Object.freeze({
    ...identity,
    environmentDigest: digestVerificationValue(identity),
  });
};

export const createGoldenG3V6ControlledEnvironmentEvidence = (input: {
  plan: VerificationPlan;
  browserAttempts: readonly GoldenG3V6BrowserAttempt[];
  staticAttempts: readonly GoldenG3V6StaticAdapterAttempt[];
  toolchainEvidence: GoldenG3V6StaticToolchainEvidence;
}): GoldenG3V6ControlledEnvironmentEvidence => {
  assertGoldenG3V6BrowserIdentityRegistry();
  const selectedPlatform = createGoldenG3V6SelectedPlatformIdentity();
  const selectedPlatformDigest = digestVerificationValue(selectedPlatform);
  const staticRuntimeEnvironments = Object.freeze(
    (['react-vite', 'vue-vite'] as const).map((frameworkTarget) => {
      const evidence = input.toolchainEvidence[frameworkTarget];
      return createGoldenG3V6StaticRuntimeEnvironmentEvidence({
        frameworkTarget,
        executableSnapshotDigest: evidence.snapshot.contentDigest,
        authorityReceipt: evidence.toolchain.authorityReceipt,
      });
    })
  );
  const staticEnvironmentByTarget = new Map(
    staticRuntimeEnvironments.map((environment) => [
      environment.frameworkTarget,
      environment,
    ])
  );
  const browserBindings = input.browserAttempts.map((attempt) => {
    const cell = input.plan.cells.find(({ id }) => id === attempt.cellId);
    if (!cell?.browserEngine) {
      throw new Error(
        `Golden V6 Browser attempt "${attempt.attemptId}" has no Browser Plan cell.`
      );
    }
    const expectedRuntimeEnvironmentDigest =
      createBrowserVerificationRuntimeEnvironmentDigest(
        createGoldenG3V6BrowserRuntimeIdentity(cell)
      );
    if (attempt.runtimeEnvironmentDigest !== expectedRuntimeEnvironmentDigest) {
      throw new Error(
        `Golden V6 Browser attempt "${attempt.attemptId}" environment drifted from the pre-adopted registry.`
      );
    }
    return Object.freeze({
      attemptId: attempt.attemptId,
      executionBoundary: 'browser' as const,
      runtimeEnvironmentDigest: expectedRuntimeEnvironmentDigest,
    });
  });
  const staticBindings = input.staticAttempts.map((attempt) => {
    const cell = input.plan.cells.find(({ id }) => id === attempt.cellId);
    const environment = cell
      ? staticEnvironmentByTarget.get(
          cell.frameworkTarget as GoldenG3V6FrameworkTarget
        )
      : undefined;
    if (
      !cell ||
      cell.browserEngine !== undefined ||
      !environment ||
      attempt.executableSnapshotDigest !==
        environment.executableSnapshotDigest ||
      attempt.runtimeEnvironmentDigest !== environment.environmentDigest ||
      attempt.toolchainAuthorityReceiptDigest !==
        environment.toolchainAuthorityReceiptDigest
    ) {
      throw new Error(
        `Golden V6 static attempt "${attempt.cellId}" environment drifted from its OS sandbox authority.`
      );
    }
    return Object.freeze({
      attemptId: attempt.attemptId,
      executionBoundary: 'node' as const,
      runtimeEnvironmentDigest: attempt.runtimeEnvironmentDigest,
    });
  });
  const attemptBindings = Object.freeze(
    [...browserBindings, ...staticBindings].sort((left, right) =>
      compareUnicodeCodePoints(left.attemptId, right.attemptId)
    )
  );
  if (
    browserBindings.length !== 72 ||
    staticBindings.length !== 8 ||
    attemptBindings.length !== 80 ||
    new Set(attemptBindings.map(({ attemptId }) => attemptId)).size !== 80 ||
    staticRuntimeEnvironments.some(
      ({ selectedPlatformDigest: digest }) => digest !== selectedPlatformDigest
    )
  ) {
    throw new Error(
      'Golden V6 controlled environment evidence does not cover all 80 attempts.'
    );
  }
  const identity = Object.freeze({
    format: 'prodivix.golden-g3-v6-controlled-environment-evidence' as const,
    version: 1 as const,
    selectedPlatform,
    selectedPlatformDigest,
    browserIdentityRegistryDigest:
      GOLDEN_G3_V6_BROWSER_IDENTITY_REGISTRY_DIGEST,
    browserImages: createGoldenG3V6ControlledBrowserImageIdentities(),
    staticRuntimeEnvironments,
    attemptBindings,
    browserAttemptCount: 72 as const,
    staticAttemptCount: 8 as const,
    nodeVersion: '22.23.1' as const,
    pnpmVersion: '11.9.0' as const,
  });
  return Object.freeze({
    ...identity,
    evidenceDigest: digestVerificationValue(identity),
  });
};
