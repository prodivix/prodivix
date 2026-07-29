import { projectExecutableProjectRuntimeFiles } from '@prodivix/runtime-core';
import { digestVerificationValue } from '@prodivix/verification';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareGoldenBrowserProject } from './generatedProjectHarness';
import type { GoldenControlledStaticToolchainAuthorityReceipt } from './generatedProjectToolchain';
import { createGoldenG3V6StaticRuntimeEnvironmentEvidence } from './goldenG3V6ControlledEnvironmentEvidence';
import { createGoldenG3V6ExecutableSnapshot } from './goldenG3V6ExecutableSnapshot';
import { createGoldenG3ReactCatalogSnapshot } from './goldenG3ScenarioFixture';

const digest = (fill: string): string => `sha256-${fill.repeat(64)}`;

const fullyRehashReceipt = (
  receipt: GoldenControlledStaticToolchainAuthorityReceipt
): GoldenControlledStaticToolchainAuthorityReceipt => {
  const commands = Object.freeze(
    receipt.commands.map((command, index) =>
      index === 0
        ? Object.freeze({
            ...command,
            args: Object.freeze([...command.args, '--forged']),
          })
        : command
    )
  );
  const sandboxIdentity = Object.freeze({
    provider: receipt.provider,
    requestDigest: receipt.requestDigest,
    snapshotDigest: receipt.snapshotDigest,
    environment: receipt.environment,
    commands,
    isolation: receipt.isolation,
    processTree: receipt.processTree,
    toolchain: receipt.toolchain,
    artifacts: receipt.artifacts,
  });
  const identity = Object.freeze({
    format: receipt.format,
    ...sandboxIdentity,
    sandboxResultDigest: digestVerificationValue(sandboxIdentity),
  });
  return Object.freeze({
    ...identity,
    receiptDigest: digestVerificationValue(identity),
  });
};

const gatedDescribe = describe.runIf(
  process.env.PRODIVIX_VERIFY_G3_V6_ADAPTER_MATRIX === '1'
);

gatedDescribe('Golden G3 V6 controlled environment evidence', () => {
  let authorityReceipt: GoldenControlledStaticToolchainAuthorityReceipt;
  let executableSnapshotDigest: string;
  let disposeProject = async (): Promise<void> => undefined;

  beforeAll(async () => {
    const snapshot = createGoldenG3V6ExecutableSnapshot(
      createGoldenG3ReactCatalogSnapshot()
    );
    const project = await prepareGoldenBrowserProject(
      {
        files: projectExecutableProjectRuntimeFiles(snapshot, 'test'),
      },
      { executableSnapshot: snapshot }
    );
    disposeProject = project.dispose;
    if (!project.toolchain) {
      throw new Error(
        'Golden V6 controlled environment fixture did not expose strict toolchain authority.'
      );
    }
    authorityReceipt = project.toolchain.authorityReceipt;
    executableSnapshotDigest = snapshot.contentDigest;
  }, 90_000);

  afterAll(async () => {
    await disposeProject();
  }, 60_000);

  it('binds an owner-decoded OS sandbox, Node binary, pnpm, lockfile, and zero live egress', () => {
    const evidence = createGoldenG3V6StaticRuntimeEnvironmentEvidence({
      frameworkTarget: 'react-vite',
      executableSnapshotDigest,
      authorityReceipt,
    });

    expect(evidence).toMatchObject({
      frameworkTarget: 'react-vite',
      sandboxProvider: authorityReceipt.provider,
      networkMode: 'none',
      liveEgressSuccessCount: 0,
      hostMountCount: 0,
      nodeVersion: '22.23.1',
      nodeBinaryDigest: authorityReceipt.toolchain.nodeBinaryDigest,
      pnpmVersion: '11.9.0',
      rollupVersion: '4.62.3',
      rollupImplementation: '@rollup/wasm-node',
      rollupAliasSpec: 'npm:@rollup/wasm-node@4.62.3',
      esbuildVersion: '0.27.7',
      esbuildImplementation: 'esbuild-wasm',
      esbuildAliasSpec: 'npm:esbuild-wasm@0.27.7',
      lockDigest: authorityReceipt.toolchain.lockDigest,
    });
    expect(evidence.liveEgressAttemptCount).toBeGreaterThanOrEqual(5);
    expect(evidence.nodeBinaryDigest).toMatch(/^sha256-[a-f0-9]{64}$/u);
    expect(evidence.environmentDigest).toMatch(/^sha256-[a-f0-9]{64}$/u);
  });

  it('rejects snapshot mismatch on a sealed receipt and a fully rehashed forged clone', () => {
    expect(() =>
      createGoldenG3V6StaticRuntimeEnvironmentEvidence({
        frameworkTarget: 'vue-vite',
        executableSnapshotDigest: digest('f'),
        authorityReceipt,
      })
    ).toThrow(/snapshot/u);

    const forged = fullyRehashReceipt(authorityReceipt);
    expect(() =>
      createGoldenG3V6StaticRuntimeEnvironmentEvidence({
        frameworkTarget: 'react-vite',
        executableSnapshotDigest,
        authorityReceipt: forged,
      })
    ).toThrow(/strict owner decoder/u);
  });
});
