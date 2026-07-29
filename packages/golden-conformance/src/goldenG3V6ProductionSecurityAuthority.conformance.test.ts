import {
  COMPILER_DIAGNOSTIC_TEST_EXTENSION_OWNER,
  COMPILER_DIAGNOSTIC_TEST_EXTENSION_RECEIPT_FORMAT,
  COMPILER_FIXTURE_PROJECTION_BUILD_PATH,
  COMPILER_FIXTURE_PROJECTION_FILE_FORMAT,
  COMPILER_FIXTURE_PROJECTION_RECEIPT_FORMAT,
  COMPILER_FIXTURE_PROJECTION_SOURCE_PATH,
  WORKSPACE_VERIFICATION_CREDENTIAL_CANARY,
  WORKSPACE_VERIFICATION_PROBE_CANARY,
  WORKSPACE_VERIFICATION_PROBE_ENDPOINT,
  WORKSPACE_VERIFICATION_PROBE_MODULE_ID,
  WORKSPACE_VERIFICATION_PROBE_MODULE_PATH,
} from '@prodivix/prodivix-compiler';
import {
  EXECUTABLE_PROJECT_DATA_MOCK_PROVISION_PATH,
  EXECUTABLE_PROJECT_SERVER_RUNTIME_MOCK_PROVISION_PATH,
  EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH,
  EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT,
  EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_MEDIA_TYPE,
  type ExecutionBuildBundle,
} from '@prodivix/runtime-core';
import { SERVER_RUNTIME_TEST_PROVISION_FORMAT } from '@prodivix/server-runtime';
import { digestVerificationValue } from '@prodivix/verification';
import {
  createBrowserCspObservationDigest,
  createBrowserVerificationTargetBinding,
  digestBrowserVerificationBytes,
  type BrowserSecurityCoreResolvedRuleId,
} from '@prodivix/verification-browser';
import { describe, expect, it } from 'vitest';
import { createGoldenG3V6Plan } from './goldenG3V6AdapterMatrixFixture';
import {
  disposeGoldenG3V6Frameworks,
  prepareGoldenG3V6Frameworks,
} from './goldenG3V6BrowserMatrixProjects';
import { GOLDEN_BROWSER_RESPONSE_POLICIES } from './generatedProjectHarness';
import {
  GOLDEN_G3_V6_CONTENT_SECURITY_POLICY_DIGEST,
  GOLDEN_G3_V6_PERMISSIONS_POLICY_DIGEST,
  GoldenG3V6ProductionSecurityError,
  assertGoldenG3V6BrowserResponsePolicyDigests,
  assertGoldenG3V6ProductionSecurityAuthorityClean,
  createGoldenG3V6ProductionSecurityAuthority,
  digestGoldenG3V6ProductionBuildBundle,
} from './goldenG3V6ProductionSecurityAuthority';
import {
  assertGoldenG3V6ProductionFixtureAbsenceReceipt,
  issueGoldenG3V6ProductionFixtureAbsenceReceipt,
} from './goldenG3V6ProductionFixtureAbsenceReceipt';
import {
  createGoldenG3V6ReactProductionSnapshot,
  createGoldenG3V6VueProductionSnapshot,
} from './goldenG3ScenarioFixture';

const signal = Object.freeze({
  aborted: false,
  subscribe: () => () => undefined,
});

const withFile = (
  bundle: ExecutionBuildBundle,
  path: string,
  source: string
): ExecutionBuildBundle => {
  const contents = new TextEncoder().encode(source);
  return Object.freeze({
    ...bundle,
    files: Object.freeze(
      [
        ...bundle.files,
        Object.freeze({
          path,
          size: contents.byteLength,
          digest: digestBrowserVerificationBytes(contents),
          contents,
        }),
      ].sort((left, right) => (left.path < right.path ? -1 : 1))
    ),
  });
};

const gatedDescribe = describe.runIf(
  process.env.PRODIVIX_VERIFY_G3_V6_ADAPTER_MATRIX === '1'
);

gatedDescribe('Golden G3 V6 same-production security authority', () => {
  it('hard-cuts fixed verification and fixture markers from both production snapshots', () => {
    const markers = Object.freeze([
      WORKSPACE_VERIFICATION_PROBE_CANARY,
      WORKSPACE_VERIFICATION_PROBE_ENDPOINT,
      WORKSPACE_VERIFICATION_PROBE_MODULE_ID,
      WORKSPACE_VERIFICATION_PROBE_MODULE_PATH,
      WORKSPACE_VERIFICATION_CREDENTIAL_CANARY,
      COMPILER_DIAGNOSTIC_TEST_EXTENSION_RECEIPT_FORMAT,
      COMPILER_DIAGNOSTIC_TEST_EXTENSION_OWNER,
      COMPILER_FIXTURE_PROJECTION_FILE_FORMAT,
      COMPILER_FIXTURE_PROJECTION_RECEIPT_FORMAT,
      COMPILER_FIXTURE_PROJECTION_SOURCE_PATH,
      COMPILER_FIXTURE_PROJECTION_BUILD_PATH,
      EXECUTABLE_PROJECT_DATA_MOCK_PROVISION_PATH,
      EXECUTABLE_PROJECT_SERVER_RUNTIME_MOCK_PROVISION_PATH,
      SERVER_RUNTIME_TEST_PROVISION_FORMAT,
      'prodivix.executable-server-runtime-provision.v1',
      'deterministic-test',
      EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH,
      EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT,
      EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_MEDIA_TYPE,
    ]);
    const decoder = new TextDecoder();
    const findings = [
      createGoldenG3V6ReactProductionSnapshot(),
      createGoldenG3V6VueProductionSnapshot(),
    ].flatMap((snapshot) =>
      snapshot.files.flatMap((file) => {
        const contents =
          typeof file.contents === 'string'
            ? file.contents
            : decoder.decode(file.contents);
        return markers.flatMap((marker) => [
          ...(file.path.includes(marker)
            ? [{ target: snapshot.target.presetId, path: file.path, marker }]
            : []),
          ...(contents.includes(marker)
            ? [{ target: snapshot.target.presetId, path: file.path, marker }]
            : []),
        ]);
      })
    );
    expect(findings).toEqual([]);
  });

  it('keeps the fixed Browser header expectations independent from widened policy', () => {
    expect(() => assertGoldenG3V6BrowserResponsePolicyDigests()).not.toThrow();
    expect(
      createBrowserCspObservationDigest(
        GOLDEN_BROWSER_RESPONSE_POLICIES.contentSecurityPolicy
      )
    ).toBe(GOLDEN_G3_V6_CONTENT_SECURITY_POLICY_DIGEST);
    expect(GOLDEN_G3_V6_PERMISSIONS_POLICY_DIGEST).toMatch(
      /^sha256-[a-f0-9]{64}$/u
    );
    expect(
      createBrowserCspObservationDigest(
        `${GOLDEN_BROWSER_RESPONSE_POLICIES.contentSecurityPolicy}; connect-src *`
      )
    ).not.toBe(GOLDEN_G3_V6_CONTENT_SECURITY_POLICY_DIGEST);
  });

  it('resolves three real owner records over the exact Vite dist and rejects probe, fixture, credential, and uninspectable drift', async () => {
    const planResult = createGoldenG3V6Plan();
    expect(planResult.status).toBe('ready');
    if (planResult.status !== 'ready') return;
    const cell = planResult.plan.cells.find(
      (candidate) =>
        candidate.checkKind === 'security' &&
        candidate.frameworkTarget === 'vue-vite' &&
        candidate.surface === 'ci'
    );
    expect(cell).toBeDefined();
    expect(cell?.browserEngine).toBe('chromium');
    expect(cell?.controlProfileRef?.digest).toMatch(/^sha256-[a-f0-9]{64}$/u);
    if (!cell?.browserEngine || !cell.controlProfileRef?.digest) return;

    const frameworks = await prepareGoldenG3V6Frameworks();
    const framework = frameworks['vue-vite'];
    const productionSnapshot = framework.productionSnapshot;
    const forbiddenFixtureSourceSnapshot = framework.testSnapshot;
    const project = framework.productionProject;
    try {
      const toolchain = project.toolchain;
      expect(toolchain).toBeDefined();
      expect(framework.productionFixtureAbsenceReceipt).toBeDefined();
      if (!toolchain || !framework.productionFixtureAbsenceReceipt) {
        return;
      }
      for (const [frameworkTarget, prepared] of Object.entries(frameworks)) {
        const receipt = prepared.productionFixtureAbsenceReceipt;
        expect(receipt, frameworkTarget).toBeDefined();
        expect(receipt).toMatchObject({
          productionSnapshotDigest: prepared.productionSnapshot.contentDigest,
          buildBundle: {
            bundleDigest: digestGoldenG3V6ProductionBuildBundle(
              prepared.productionProject.toolchain!.buildBundle
            ),
          },
          scans: {
            snapshotFiles: { status: 'clean', findingCount: 0 },
            generatedBuildFiles: { status: 'clean', findingCount: 0 },
            viteDistBundle: { status: 'clean', findingCount: 0 },
          },
        });
        expect(receipt?.forbiddenMarkers.map(({ value }) => value)).toEqual(
          expect.arrayContaining([
            COMPILER_DIAGNOSTIC_TEST_EXTENSION_RECEIPT_FORMAT,
            COMPILER_FIXTURE_PROJECTION_BUILD_PATH,
            EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH,
            EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT,
            EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_MEDIA_TYPE,
          ])
        );
      }
      for (const file of toolchain.buildBundle.files) {
        const path = file.path
          .split('/')
          .map((segment) => encodeURIComponent(segment))
          .join('/');
        const response = await fetch(`${project.origin}/${path}`);
        expect(response.status, file.path).toBe(200);
        const servedBytes = new Uint8Array(await response.arrayBuffer());
        expect(servedBytes.byteLength, file.path).toBe(file.size);
        expect(digestBrowserVerificationBytes(servedBytes), file.path).toBe(
          file.digest
        );
      }

      const target = createBrowserVerificationTargetBinding({
        origin: project.origin,
        attemptId: 'attempt-g3-v6-production-security',
        generation: 1,
        executableSnapshotDigest: productionSnapshot.contentDigest,
        cell,
        runtimeIdentity: Object.freeze({
          machineClass: 'golden-g3-v6-security',
          operatingSystemImageDigest: digestVerificationValue({
            os: 'golden-test',
          }),
          browserImageDigest: digestVerificationValue({
            browser: 'chromium',
          }),
          browserEngine: cell.browserEngine,
          browserVersion: '1.61.1',
          fontSetDigest: digestVerificationValue({
            fonts: 'golden-test',
          }),
          viewport: Object.freeze({
            widthCssPixels: cell.viewport.width,
            heightCssPixels: cell.viewport.height,
            devicePixelRatio: 1,
          }),
          colorScheme: cell.colorScheme,
          motionPreference: cell.motion,
          locale: cell.locale,
          cacheClass: 'cold',
          rendererGeneration: 'golden-g3-v6',
          normalizer: Object.freeze({
            id: 'golden-g3-v6-normalizer',
            version: '1.0.0',
          }),
        }),
      });
      const observationBinding = Object.freeze({
        cellId: cell.id,
        attemptId: target.binding.attemptId,
        generation: target.binding.generation,
        executableSnapshotDigest: target.binding.executableSnapshotDigest,
        runtimeEnvironmentDigest: target.binding.runtimeEnvironmentDigest,
        controlProfileDigest: cell.controlProfileRef.digest,
      });
      const createAuthority = (
        bundle: ExecutionBuildBundle,
        materializedBundleBytes?: Uint8Array
      ) =>
        createGoldenG3V6ProductionSecurityAuthority({
          productionSnapshot,
          forbiddenFixtureSourceSnapshot,
          productionFixtureAbsenceReceipt:
            framework.productionFixtureAbsenceReceipt!,
          buildBundle: bundle,
          servedBundleDigest: digestGoldenG3V6ProductionBuildBundle(bundle),
          ...(materializedBundleBytes === undefined
            ? {}
            : { materializedBundleBytes }),
          origin: project.origin,
          targetBinding: target.binding,
          targetBindingDigest: target.bindingDigest,
          observationBinding,
          inputId: 'golden-g3-v6-production-security-observations',
        });

      const authority = createAuthority(toolchain.buildBundle);
      expect(
        authority.observationSet.observations.map(({ observation }) => ({
          ruleId: observation.ruleId,
          state: observation.state,
          violationCount:
            observation.state === 'complete'
              ? observation.violationCount
              : undefined,
          digestsMatch:
            observation.state === 'complete'
              ? observation.expectedDigest === observation.observedDigest
              : false,
        }))
      ).toEqual([
        {
          ruleId: 'security.output-artifact-uninspectable',
          state: 'complete',
          violationCount: 0,
          digestsMatch: true,
        },
        {
          ruleId: 'security.production-probe-leak',
          state: 'complete',
          violationCount: 0,
          digestsMatch: true,
        },
        {
          ruleId: 'security.secret-canary',
          state: 'complete',
          violationCount: 0,
          digestsMatch: true,
        },
      ]);
      expect(() =>
        assertGoldenG3V6ProductionSecurityAuthorityClean(authority)
      ).not.toThrow();
      expect(authority.observationSet.observations).toHaveLength(3);
      expect(
        authority.observationSet.observations.every(
          ({ observation }) =>
            observation.state === 'complete' &&
            observation.violationCount === 0 &&
            observation.expectedDigest === observation.observedDigest
        )
      ).toBe(true);
      expect(authority.coreExpectedChecks).toHaveLength(3);
      expect(authority.input.ref).toMatchObject({
        kind: 'security-observation-set',
        digest: digestBrowserVerificationBytes(authority.input.bytes),
        size: authority.input.bytes.byteLength,
      });
      expect(authority.evidence).toMatchObject({
        productionSnapshotDigest: productionSnapshot.contentDigest,
        canarySourceSnapshotDigest:
          forbiddenFixtureSourceSnapshot.contentDigest,
        servedBundleDigest: authority.evidence.scannedBundleDigest,
        scannedBundleDigest: authority.evidence.materializedBundleDigest,
        targetBindingDigest: target.bindingDigest,
        exactBundleBinding: true,
      });
      expect(
        new Set(Object.values(authority.evidence.sourceDigests)).size
      ).toBe(3);
      expect(authority.evidence).toMatchObject({
        resolutionAuditBindingDigest: expect.stringMatching(
          /^sha256-[a-f0-9]{64}$/u
        ),
        staticEvidenceDigest: expect.stringMatching(/^sha256-[a-f0-9]{64}$/u),
      });
      const pendingAudit = authority.resolutionAudit.snapshot();
      expect(pendingAudit).toMatchObject({
        bindingDigest: authority.evidence.resolutionAuditBindingDigest,
        status: 'pending',
        successfulRuleIds: [],
        totalResolveCount: 0,
        totalAttemptCount: 0,
        exact: false,
      });
      const resolved = await Promise.all(
        authority.observationSet.observations.map((entry) =>
          authority.authority.resolve(
            {
              ruleId: entry.observation.ruleId,
              source: entry.source,
              binding: authority.observationSet.binding,
            },
            signal
          )
        )
      );
      expect(resolved).toEqual(authority.observationSet.observations);
      resolved.forEach((entry, index) => {
        expect(entry).not.toBe(authority.observationSet.observations[index]);
      });
      const exactAudit = authority.resolutionAudit.assertExact();
      expect(exactAudit).toMatchObject({
        status: 'exact',
        totalResolveCount: 3,
        totalAttemptCount: 3,
        exact: true,
        failureCounts: {
          aborted: 0,
          duplicate: 0,
          unexpectedRule: 0,
          identityDrift: 0,
          ownerResolutionFailed: 0,
        },
      });
      expect(exactAudit.ruleResolutionCounts).toHaveLength(3);
      expect(
        exactAudit.ruleResolutionCounts.every(({ count }) => count === 1)
      ).toBe(true);
      expect(exactAudit.auditDigest).toMatch(/^sha256-[a-f0-9]{64}$/u);
      expect(exactAudit.evidenceDigest).toMatch(/^sha256-[a-f0-9]{64}$/u);
      expect(exactAudit.evidenceDigest).not.toBe(pendingAudit.evidenceDigest);
      expect(authority.resolutionAudit.snapshot()).toEqual(exactAudit);
      const absenceReceipt = issueGoldenG3V6ProductionFixtureAbsenceReceipt(
        authority,
        exactAudit
      );
      expect(absenceReceipt).toMatchObject({
        cellId: cell.id,
        attemptId: target.binding.attemptId,
        generation: 1,
        executableSnapshotDigest: productionSnapshot.contentDigest,
        runtimeEnvironmentDigest: target.binding.runtimeEnvironmentDigest,
        controlProfileDigest: cell.controlProfileRef.digest,
        targetBindingDigest: target.bindingDigest,
        compilerProductionFixtureAbsenceReceiptDigest:
          framework.productionFixtureAbsenceReceipt.receiptDigest,
        servedBundleDigest: absenceReceipt.scannedBundleDigest,
        scannedBundleDigest: absenceReceipt.materializedBundleDigest,
        materializedBundleDigest: absenceReceipt.canonicalBundleDigest,
      });
      expect(absenceReceipt.ownerObservations).toHaveLength(3);
      expect(() =>
        assertGoldenG3V6ProductionFixtureAbsenceReceipt(
          absenceReceipt,
          authority,
          exactAudit
        )
      ).not.toThrow();
      expect(() =>
        assertGoldenG3V6ProductionFixtureAbsenceReceipt(
          absenceReceipt,
          Object.freeze({ ...authority }),
          exactAudit
        )
      ).toThrow(GoldenG3V6ProductionSecurityError);
      const lastInputByteIndex = authority.input.bytes.byteLength - 1;
      const originalInputByte = authority.input.bytes[lastInputByteIndex]!;
      authority.input.bytes[lastInputByteIndex] = originalInputByte ^ 1;
      expect(() =>
        assertGoldenG3V6ProductionFixtureAbsenceReceipt(
          absenceReceipt,
          authority,
          exactAudit
        )
      ).toThrow();
      authority.input.bytes[lastInputByteIndex] = originalInputByte;
      expect(() =>
        assertGoldenG3V6ProductionFixtureAbsenceReceipt(
          {
            ...absenceReceipt,
            compilerProductionFixtureAbsenceReceiptDigest:
              digestVerificationValue({ forged: true }),
          },
          authority,
          exactAudit
        )
      ).toThrow(GoldenG3V6ProductionSecurityError);
      const { receiptDigest: _receiptDigest, ...absenceReceiptIdentity } =
        absenceReceipt;
      const forgedIdentity = Object.freeze({
        ...absenceReceiptIdentity,
        compilerProductionFixtureAbsenceReceiptDigest: digestVerificationValue({
          forged: 'compiler-authority',
        }),
      });
      expect(() =>
        assertGoldenG3V6ProductionFixtureAbsenceReceipt(
          Object.freeze({
            ...forgedIdentity,
            receiptDigest: digestVerificationValue(forgedIdentity),
          }),
          authority,
          exactAudit
        )
      ).toThrow(GoldenG3V6ProductionSecurityError);

      const duplicateAuthority = createAuthority(toolchain.buildBundle);
      const first = duplicateAuthority.observationSet.observations[0]!;
      const firstRequest = {
        ruleId: first.observation.ruleId,
        source: first.source,
        binding: duplicateAuthority.observationSet.binding,
      };
      await expect(
        duplicateAuthority.authority.resolve(firstRequest, signal)
      ).resolves.toEqual(first);
      await expect(
        duplicateAuthority.authority.resolve(firstRequest, signal)
      ).resolves.toBeUndefined();
      expect(duplicateAuthority.resolutionAudit.snapshot()).toMatchObject({
        totalResolveCount: 1,
        totalAttemptCount: 2,
        exact: false,
        failureCounts: { duplicate: 1 },
      });
      expect(() => duplicateAuthority.resolutionAudit.assertExact()).toThrow(
        GoldenG3V6ProductionSecurityError
      );

      const unexpectedAuthority = createAuthority(toolchain.buildBundle);
      await expect(
        unexpectedAuthority.authority.resolve(
          {
            ...firstRequest,
            ruleId:
              'security.unexpected-network' as BrowserSecurityCoreResolvedRuleId,
            binding: unexpectedAuthority.observationSet.binding,
          },
          signal
        )
      ).resolves.toBeUndefined();
      expect(unexpectedAuthority.resolutionAudit.snapshot()).toMatchObject({
        status: 'failed',
        successfulRuleIds: [],
        totalResolveCount: 0,
        totalAttemptCount: 1,
        failureCounts: { unexpectedRule: 1 },
      });
      expect(() => unexpectedAuthority.resolutionAudit.assertExact()).toThrow(
        GoldenG3V6ProductionSecurityError
      );

      const abortedAuthority = createAuthority(toolchain.buildBundle);
      await expect(
        abortedAuthority.authority.resolve(
          {
            ...firstRequest,
            binding: abortedAuthority.observationSet.binding,
          },
          {
            aborted: true,
            reason: 'test-abort',
            subscribe: () => () => undefined,
          }
        )
      ).resolves.toBeUndefined();
      expect(abortedAuthority.resolutionAudit.snapshot()).toMatchObject({
        status: 'failed',
        successfulRuleIds: [],
        totalResolveCount: 0,
        totalAttemptCount: 1,
        failureCounts: { aborted: 1 },
      });
      expect(() => abortedAuthority.resolutionAudit.assertExact()).toThrow(
        GoldenG3V6ProductionSecurityError
      );

      const driftAuthority = createAuthority(toolchain.buildBundle);
      await expect(
        driftAuthority.authority.resolve(
          {
            ...firstRequest,
            source: {
              ...first.source,
              sourceDigest: digestVerificationValue({
                forged: true,
              }),
            },
            binding: driftAuthority.observationSet.binding,
          },
          signal
        )
      ).resolves.toBeUndefined();
      expect(driftAuthority.resolutionAudit.snapshot()).toMatchObject({
        status: 'failed',
        successfulRuleIds: [],
        totalResolveCount: 0,
        totalAttemptCount: 1,
        failureCounts: { identityDrift: 1 },
      });
      expect(() => driftAuthority.resolutionAudit.assertExact()).toThrow(
        GoldenG3V6ProductionSecurityError
      );

      for (const [label, marker] of [
        ['probe', WORKSPACE_VERIFICATION_PROBE_CANARY],
        ['credential', WORKSPACE_VERIFICATION_CREDENTIAL_CANARY],
        [
          'diagnostic receipt',
          COMPILER_DIAGNOSTIC_TEST_EXTENSION_RECEIPT_FORMAT,
        ],
        ['auth endpoint', EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH],
        [
          'auth response format',
          EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT,
        ],
        [
          'auth response media type',
          EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_MEDIA_TYPE,
        ],
      ] as const) {
        expect(
          () =>
            createAuthority(
              withFile(
                toolchain.buildBundle,
                `zz-${label.replaceAll(' ', '-')}-leak.js`,
                marker
              )
            ),
          label
        ).toThrow(GoldenG3V6ProductionSecurityError);
      }
      expect(() =>
        createAuthority(
          withFile(
            toolchain.buildBundle,
            'zz-clean-drift.js',
            'export const unrelated = true;'
          )
        )
      ).toThrow(/exact Vite dist bundle/u);

      const uninspectable = createAuthority(
        toolchain.buildBundle,
        new TextEncoder().encode('{')
      );
      expect(uninspectable.evidence.exactBundleBinding).toBe(false);
      expect(
        uninspectable.observationSet.observations.find(
          ({ observation }) =>
            observation.ruleId === 'security.output-artifact-uninspectable'
        )?.observation
      ).toMatchObject({
        state: 'blocked',
        reasonCode: 'runtime-core-artifact-uninspectable',
      });
      expect(() =>
        assertGoldenG3V6ProductionSecurityAuthorityClean(uninspectable)
      ).toThrowError(
        expect.objectContaining({
          failedRuleIds: ['security.output-artifact-uninspectable'],
        })
      );
    } finally {
      await disposeGoldenG3V6Frameworks(frameworks);
    }
  }, 300_000);
});
