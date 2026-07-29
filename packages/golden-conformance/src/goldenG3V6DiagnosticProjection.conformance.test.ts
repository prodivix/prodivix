import { BEHAVIOR_DETERMINISTIC_CONTROL_PRESET } from '@prodivix/behavior';
import {
  COMPILER_FIXTURE_PROJECTION_BUILD_PATH,
  COMPILER_FIXTURE_PROJECTION_SOURCE_PATH,
  assertWorkspaceDiagnosticProjectionReceipt,
  issueCompilerFixtureProjectionReceipt,
  issueWorkspaceDiagnosticProjectionReceipt,
  type IssueWorkspaceDiagnosticProjectionReceiptInput,
  type WorkspaceDiagnosticCompilerTarget,
} from '@prodivix/prodivix-compiler';
import {
  EXECUTABLE_PROJECT_LIMITS,
  EXECUTION_BUILD_BUNDLE_FORMAT,
  projectExecutableProjectRuntimeFiles,
} from '@prodivix/runtime-core';
import { digestVerificationValue } from '@prodivix/verification';
import {
  VERIFICATION_TRACE_MEDIA_TYPE,
  decodeDiagnosticVerificationSnapshot,
  decodeVerificationTrace,
  digestVerificationAdapterBytes,
  encodeDiagnosticVerificationSnapshot,
  encodeVerificationTrace,
} from '@prodivix/verification-adapters';
import { describe, expect, it } from 'vitest';
import { createGoldenG3V6ExecutableSnapshotAuthority } from './goldenG3V6ExecutableSnapshot';
import {
  GOLDEN_G3_CATALOG_WORKSPACE,
  GOLDEN_G3_LOGIN_FIXTURE_SET,
  createGoldenG3V6ReactCatalogSnapshot,
  createGoldenG3V6ReactCompilerTarget,
  createGoldenG3V6VueCatalogSnapshot,
  createGoldenG3V6VueCompilerTarget,
} from './goldenG3ScenarioFixture';

const createDiagnosticProjection = (framework: 'react-vite' | 'vue-vite') => {
  const compilerBase =
    framework === 'react-vite'
      ? createGoldenG3V6ReactCatalogSnapshot()
      : createGoldenG3V6VueCatalogSnapshot();
  const compiler: WorkspaceDiagnosticCompilerTarget =
    framework === 'react-vite'
      ? createGoldenG3V6ReactCompilerTarget()
      : createGoldenG3V6VueCompilerTarget();
  const authority = createGoldenG3V6ExecutableSnapshotAuthority(compilerBase);
  const projectionSource = authority.snapshot.files.find(
    ({ path }) => path === COMPILER_FIXTURE_PROJECTION_SOURCE_PATH
  );
  if (!projectionSource || typeof projectionSource.contents !== 'string') {
    throw new Error(
      `Golden V6 ${framework} fixture projection source is unavailable.`
    );
  }
  const projectionBytes = new TextEncoder().encode(projectionSource.contents);
  const buildBundle = Object.freeze({
    format: EXECUTION_BUILD_BUNDLE_FORMAT,
    snapshotDigest: authority.snapshot.contentDigest,
    target: authority.snapshot.target,
    files: Object.freeze([
      Object.freeze({
        path: COMPILER_FIXTURE_PROJECTION_BUILD_PATH,
        size: projectionBytes.byteLength,
        digest: digestVerificationAdapterBytes(projectionBytes),
        contents: projectionBytes,
      }),
    ]),
  });
  const generatedFiles = projectExecutableProjectRuntimeFiles(
    authority.snapshot,
    'test'
  );
  const fixtureReceipt = issueCompilerFixtureProjectionReceipt({
    snapshot: authority.snapshot,
    fixtureSets: Object.freeze([GOLDEN_G3_LOGIN_FIXTURE_SET]),
    controlProfile: BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
    generatedFiles,
    buildBundle,
  });
  const input = Object.freeze<IssueWorkspaceDiagnosticProjectionReceiptInput>({
    workspace: GOLDEN_G3_CATALOG_WORKSPACE,
    snapshot: authority.snapshot,
    compiler,
    testExtensionReceipts: Object.freeze([authority.testExtensionReceipt]),
    fixtureProjectionAuthority: Object.freeze({
      fixtureSets: Object.freeze([GOLDEN_G3_LOGIN_FIXTURE_SET]),
      controlProfile: BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
      generatedFiles,
      buildBundle,
      receipt: fixtureReceipt,
    }),
  });
  return Object.freeze({
    input,
    receipt: issueWorkspaceDiagnosticProjectionReceipt(input),
  });
};

describe('Golden G3 V6 Compiler-owned diagnostic projection', () => {
  it.each(['react-vite', 'vue-vite'] as const)(
    'binds the %s final snapshot, extension/fixture lineage, findings, and trace',
    (framework) => {
      const projection = createDiagnosticProjection(framework);
      const { receipt } = projection;
      expect(() =>
        assertWorkspaceDiagnosticProjectionReceipt(receipt, projection.input)
      ).not.toThrow();
      expect(receipt).toMatchObject({
        compilerProjectionDigest: projection.input.snapshot.contentDigest,
        target: { presetId: framework },
        lineage: {
          testExtensionReceiptDigests: [
            projection.input.testExtensionReceipts![0]!.receiptDigest,
          ],
          fixtureProjectionReceiptDigest:
            projection.input.fixtureProjectionAuthority!.receipt.receiptDigest,
        },
        trace: {
          traceKind: 'diagnostics',
          subjectDigest: projection.input.snapshot.contentDigest,
        },
      });
      expect(
        projection.input.snapshot.files
          .filter(({ sourceTrace }) => !sourceTrace?.length)
          .map(({ path }) => path)
      ).toEqual([]);
      expect(
        receipt.findings
          .filter(
            ({ severity }) => severity === 'error' || severity === 'fatal'
          )
          .map((finding) => ({
            ...finding,
            path: projection.input.snapshot.files.find(
              ({ path }) =>
                finding.targetId ===
                `${finding.ruleId.split('.', 1)[0]}:${digestVerificationValue({
                  workspaceId: projection.input.workspace.id,
                  path,
                  targetRef: null,
                }).slice('sha256-'.length)}`
            )?.path,
          }))
      ).toEqual([]);
      expect(projection.input.snapshot.target).toMatchObject(
        framework === 'react-vite'
          ? { presetId: 'react-vite', framework: 'react', runtime: 'vite' }
          : { presetId: 'vue-vite', framework: 'vue', runtime: 'vite' }
      );
      expect(
        projection.input.snapshot.files.some(
          ({ path }) =>
            path ===
            (framework === 'react-vite' ? 'src/App.tsx' : 'src/App.vue')
        )
      ).toBe(true);
      expect(
        projection.input.snapshot.files.some(
          ({ path }) =>
            path ===
            (framework === 'react-vite' ? 'src/App.vue' : 'src/App.tsx')
        )
      ).toBe(false);
      expect(
        receipt.trace.entries.some(
          ({ path }) =>
            path ===
            (framework === 'react-vite' ? 'src/App.tsx' : 'src/App.vue')
        )
      ).toBe(true);
      expect(
        receipt.trace.entries.some(
          ({ path }) =>
            path ===
            (framework === 'react-vite' ? 'src/App.vue' : 'src/App.tsx')
        )
      ).toBe(false);
      expect(() =>
        assertWorkspaceDiagnosticProjectionReceipt(receipt, {
          ...projection.input,
          compiler:
            framework === 'react-vite'
              ? createGoldenG3V6VueCompilerTarget()
              : createGoldenG3V6ReactCompilerTarget(),
        })
      ).toThrow(/lineage base/u);
      expect(
        receipt.trace.entries.some(
          ({ path }) => path === 'src/prodivix-g3-v6.integration.test.ts'
        )
      ).toBe(true);
      const maximumSourceTraceCount = Math.max(
        ...receipt.trace.entries.map(({ sourceTrace }) => sourceTrace.length)
      );
      expect(maximumSourceTraceCount).toBeGreaterThan(16);
      expect(maximumSourceTraceCount).toBeLessThanOrEqual(
        EXECUTABLE_PROJECT_LIMITS.maxSourceTracesPerFile
      );

      const traceBytes = encodeVerificationTrace({
        traceKind: receipt.trace.traceKind,
        subjectDigest: receipt.trace.subjectDigest,
        entries: receipt.trace.entries,
      });
      const encoded = encodeDiagnosticVerificationSnapshot({
        cellInputDigest:
          'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        workspaceSnapshotDigest: receipt.workspaceSnapshotDigest,
        semanticIndexDigest: receipt.semanticIndexDigest,
        compilerProjectionDigest: receipt.compilerProjectionDigest,
        findings: receipt.findings,
        artifacts: Object.freeze([
          Object.freeze({
            id: `artifact:diagnostic-trace:${framework}`,
            kind: 'trace' as const,
            mediaType: VERIFICATION_TRACE_MEDIA_TYPE,
            bytes: traceBytes,
          }),
        ]),
      });
      expect(decodeDiagnosticVerificationSnapshot(encoded)).toMatchObject({
        workspaceSnapshotDigest: receipt.workspaceSnapshotDigest,
        semanticIndexDigest: receipt.semanticIndexDigest,
        compilerProjectionDigest: receipt.compilerProjectionDigest,
        findings: receipt.findings,
      });
      expect(decodeVerificationTrace(traceBytes)).toMatchObject({
        traceKind: receipt.trace.traceKind,
        subjectDigest: receipt.trace.subjectDigest,
        entries: receipt.trace.entries,
      });

      expect(() =>
        assertWorkspaceDiagnosticProjectionReceipt(
          {
            ...receipt,
            findings: Object.freeze([
              ...receipt.findings,
              Object.freeze({
                ruleId: 'forged.empty-claim',
                severity: 'error' as const,
                targetId: 'forged:diagnostic',
                messageKey: 'diagnostic.forged',
                count: 1,
                diagnosticCodes: Object.freeze(['FORGED']),
              }),
            ]),
          },
          projection.input
        )
      ).toThrow(/does not match/u);
    }
  );
});
