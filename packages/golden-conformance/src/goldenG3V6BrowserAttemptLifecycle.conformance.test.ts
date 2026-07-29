import { describe, expect, it } from 'vitest';
import type { BrowserVerificationTargetLease } from '@prodivix/verification-browser';
import {
  auditGoldenG3V6RuntimeControlRetirement,
  createGoldenG3V6AttemptCleanupScope,
  throwGoldenG3V6AttemptFailure,
} from './goldenG3V6BrowserAttemptLifecycle';
import {
  createGoldenG3V6SecurityAuthorityRegistry,
  createGoldenG3V6TargetLeaseRegistry,
} from './goldenG3V6BrowserMatrixPorts';
import type { GoldenG3V6ProductionSecurityAuthority } from './goldenG3V6ProductionSecurityAuthority';

const digest = (fill: string): string => `sha256-${fill.repeat(64)}`;

const targetLease = (attemptId: string): BrowserVerificationTargetLease =>
  Object.freeze({
    leaseId: `lease:${attemptId}`,
    origin: 'http://127.0.0.1:4173',
    binding: Object.freeze({
      format: 'prodivix.browser-verification-target-binding',
      version: 1,
      attemptId,
      generation: 1,
      executableSnapshotDigest: digest('a'),
      targetId: 'target:catalog',
      frameworkTarget: 'react-vite',
      surface: 'preview',
      browserEngine: 'chromium',
      viewport: Object.freeze({ width: 1280, height: 720 }),
      colorScheme: 'light',
      motion: 'reduced',
      locale: 'en-US',
      originDigest: digest('b'),
      runtimeEnvironmentDigest: digest('c'),
    }),
    bindingDigest: digest('d'),
    runtimeIdentity: Object.freeze({
      machineClass: 'golden-test',
      operatingSystemImageDigest: digest('e'),
      browserImageDigest: digest('f'),
      browserEngine: 'chromium',
      browserVersion: '1.0.0',
      fontSetDigest: digest('1'),
      viewport: Object.freeze({
        widthCssPixels: 1280,
        heightCssPixels: 720,
        devicePixelRatio: 1,
      }),
      colorScheme: 'light',
      motionPreference: 'reduced',
      locale: 'en-US',
      cacheClass: 'cold',
      rendererGeneration: 'renderer:test',
      normalizer: Object.freeze({
        id: 'normalizer:test',
        version: '1',
      }),
    }),
  });

const failingAuthority = (): GoldenG3V6ProductionSecurityAuthority =>
  ({
    authority: Object.freeze({
      resolve: async () => undefined,
    }),
    resolutionAudit: Object.freeze({
      snapshot: () => {
        throw new Error('partial authority');
      },
      assertExact: () => {
        throw new Error('partial authority');
      },
    }),
  }) as unknown as GoldenG3V6ProductionSecurityAuthority;

describe('Golden G3 V6 browser attempt cleanup', () => {
  it('retires runtime-control state before auditing released evidence', async () => {
    const scope = createGoldenG3V6AttemptCleanupScope();
    const order: string[] = [];
    let retired = false;
    scope.defer('runtime-control-release-audit', () => {
      if (!retired) {
        throw new Error('runtime control was audited before retirement');
      }
      order.push('audit');
    });
    scope.defer('runtime-control-retirement', () => {
      retired = true;
      order.push('retire');
    });
    await expect(scope.runAll()).resolves.toEqual([]);
    expect(order).toEqual(['retire', 'audit']);
  });

  it('requires success evidence only for successful retirement while failed attempts prove zero active state', () => {
    let asserted = 0;
    const zeroSnapshot = () => ({
      registered: 0,
      acquired: 0,
      started: 0,
      released: 0,
      active: 0,
    });
    expect(
      auditGoldenG3V6RuntimeControlRetirement({
        attemptId: 'attempt:failed',
        retiredEvidence: undefined,
        assertReleased: () => {
          asserted += 1;
          return { evidenceDigest: digest('a') };
        },
        snapshot: zeroSnapshot,
      })
    ).toBeUndefined();
    expect(asserted).toBe(0);

    const evidence = { evidenceDigest: digest('b') };
    expect(
      auditGoldenG3V6RuntimeControlRetirement({
        attemptId: 'attempt:passed',
        retiredEvidence: evidence,
        assertReleased: () => {
          asserted += 1;
          return evidence;
        },
        snapshot: zeroSnapshot,
      })
    ).toBe(evidence);
    expect(asserted).toBe(1);

    expect(() =>
      auditGoldenG3V6RuntimeControlRetirement({
        attemptId: 'attempt:failed-active',
        retiredEvidence: undefined,
        assertReleased: () => evidence,
        snapshot: () => ({ ...zeroSnapshot(), active: 1 }),
      })
    ).toThrow(/retained runtime-control state/u);
  });

  it('retires pre-prepare state after the primary operation fails', async () => {
    const scope = createGoldenG3V6AttemptCleanupScope();
    let activeArtifacts = 1;
    scope.defer('artifact-retirement', () => {
      activeArtifacts = 0;
    });
    const primary = new Error('pre-prepare failure');
    const cleanupErrors = await scope.runAll();
    expect(() =>
      throwGoldenG3V6AttemptFailure(
        'attempt:pre-prepare',
        primary,
        cleanupErrors
      )
    ).toThrow(primary);
    expect(activeArtifacts).toBe(0);
  });

  it('force-deletes a partially resolved authority when its audit fails', async () => {
    const authorities = createGoldenG3V6SecurityAuthorityRegistry();
    const attemptId = 'attempt:partial-authority';
    authorities.register(attemptId, failingAuthority());
    const scope = createGoldenG3V6AttemptCleanupScope();
    scope.defer('authority-delete', () => {
      authorities.forceDelete(attemptId);
    });
    scope.defer('authority-audit', () => {
      authorities.assertExact(attemptId);
    });
    const cleanupErrors = await scope.runAll();
    expect(cleanupErrors.map(({ stepId }) => stepId)).toEqual([
      'authority-audit',
    ]);
    expect(authorities.size()).toBe(0);
  });

  it('runs every later cleanup after runtime and lease audits fail', async () => {
    const attemptId = 'attempt:runtime-cleanup';
    const leases = createGoldenG3V6TargetLeaseRegistry();
    leases.register(targetLease(attemptId));
    let remoteActive = true;
    let activeArtifacts = 1;
    const scope = createGoldenG3V6AttemptCleanupScope();
    scope.defer('artifact-retirement', () => {
      activeArtifacts = 0;
    });
    scope.defer('remote-preview', () => {
      remoteActive = false;
    });
    scope.defer('lease-delete', () => {
      leases.forceDelete(attemptId);
    });
    scope.defer('lease-audit', () => {
      leases.assertReleased(attemptId);
    });
    scope.defer('runtime-control', () => {
      throw new Error('runtime cleanup failed');
    });
    const cleanupErrors = await scope.runAll();
    expect(cleanupErrors.map(({ stepId }) => stepId)).toEqual([
      'runtime-control',
      'lease-audit',
    ]);
    expect(leases.snapshot().registered).toBe(0);
    expect(remoteActive).toBe(false);
    expect(activeArtifacts).toBe(0);
    expect(() =>
      throwGoldenG3V6AttemptFailure(
        attemptId,
        new Error('primary failure'),
        cleanupErrors
      )
    ).toThrow(AggregateError);
  });
});
