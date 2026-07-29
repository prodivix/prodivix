import { digestVerificationValue } from '@prodivix/verification';

export const GOLDEN_G3_V6_CONTROLLED_DIMENSION_IDS = Object.freeze([
  'data.loading',
  'data.empty',
  'data.error',
  'data.retry',
  'data.pagination',
  'data.optimistic-conflict',
  'auth.signed-out',
  'auth.signed-in',
  'auth.expired',
  'auth.denied',
  'auth.authorized',
  'recovery.cancel',
  'recovery.timeout',
  'recovery.worker-loss',
  'recovery.cursor-resume',
  'recovery.duplicate',
  'recovery.out-of-order',
] as const);

export type GoldenG3V6ControlledDimensionId =
  (typeof GOLDEN_G3_V6_CONTROLLED_DIMENSION_IDS)[number];

export type GoldenG3V6ControlledDimensionCase = Readonly<{
  title: string;
  covers: readonly GoldenG3V6ControlledDimensionId[];
}>;

export type GoldenG3V6ControlledDimensionSuite = Readonly<{
  id: string;
  packageName: string;
  files: readonly string[];
  cases: readonly GoldenG3V6ControlledDimensionCase[];
}>;

const testCase = (
  title: string,
  ...covers: readonly GoldenG3V6ControlledDimensionId[]
): GoldenG3V6ControlledDimensionCase =>
  Object.freeze({ title, covers: Object.freeze(covers) });

export const GOLDEN_G3_V6_CONTROLLED_DIMENSION_SUITES = Object.freeze([
  Object.freeze({
    id: 'data-owner-runtime',
    packageName: '@prodivix/data',
    files: Object.freeze([
      'src/dataRuntime.test.ts',
      'src/dataOptimisticRuntime.test.ts',
    ]),
    cases: Object.freeze([
      testCase(
        'validates input and output schemas without publishing payload values',
        'data.error'
      ),
      testCase(
        'retries retryable queries with deterministic attempt correlation and bounded backoff',
        'data.retry'
      ),
      testCase(
        'applies pagination defaults and rejects adapter page drift',
        'data.pagination'
      ),
      testCase(
        'keeps cursor pagination explicit and fail closed',
        'data.pagination'
      ),
      testCase(
        'rejects duplicate work and prevents a superseded result from replacing the current lifecycle',
        'recovery.duplicate',
        'recovery.out-of-order'
      ),
      testCase(
        'restores the inverse snapshot when the adapter effect fails',
        'data.optimistic-conflict'
      ),
      testCase(
        'never lets an older rollback overwrite a newer mutation owner',
        'data.optimistic-conflict'
      ),
    ]),
  }),
  Object.freeze({
    id: 'data-golden-controlled-journeys',
    packageName: '@prodivix/golden-conformance',
    files: Object.freeze([
      'src/goldenG3BehaviorComposition.conformance.test.ts',
      'src/goldenG3V6ControlledDimensions.conformance.test.ts',
    ]),
    cases: Object.freeze([
      testCase(
        'fences an optimistic mutation conflict, rolls back, and commits a typed retry',
        'data.optimistic-conflict',
        'data.retry'
      ),
      testCase(
        'publishes a real loading to empty owner lifecycle',
        'data.loading',
        'data.empty'
      ),
    ]),
  }),
  Object.freeze({
    id: 'data-generated-production-runtime',
    packageName: '@prodivix/prodivix-compiler',
    files: Object.freeze(['src/workspace/standaloneDataRuntime.test.ts']),
    cases: Object.freeze([
      testCase(
        'publishes loading then success from the provider-projected fixture asset',
        'data.loading'
      ),
      testCase(
        'executes public live HTTP with schema, retry, pagination, cache, and sanitized correlation',
        'data.error',
        'data.retry',
        'data.pagination'
      ),
    ]),
  }),
  Object.freeze({
    id: 'auth-owner-principal-projection',
    packageName: '@prodivix/server-runtime',
    files: Object.freeze(['src/__tests__/isolatedServerRuntime.test.ts']),
    cases: Object.freeze([
      testCase(
        'requires an exact unexpired principal projection for authenticated execution',
        'auth.signed-out',
        'auth.signed-in',
        'auth.expired',
        'auth.denied',
        'auth.authorized'
      ),
    ]),
  }),
  Object.freeze({
    id: 'auth-golden-target-matrix',
    packageName: '@prodivix/golden-conformance',
    files: Object.freeze(['src/goldenG2AuthServerMatrix.conformance.test.ts']),
    cases: Object.freeze([
      testCase(
        'keeps every supported and denied target cell explicit',
        'auth.denied'
      ),
      testCase(
        'executes owner and workspace.read contracts in the deterministic Test session',
        'auth.authorized'
      ),
    ]),
  }),
  Object.freeze({
    id: 'recovery-adapter-lifecycle',
    packageName: '@prodivix/verification',
    files: Object.freeze([
      'src/verificationAdapterLifecycleRaces.conformance.test.ts',
    ]),
    cases: Object.freeze([
      testCase(
        'uses live cancellation and an independent non-aborted cleanup signal',
        'recovery.cancel'
      ),
      testCase(
        'times out the attempt budget but still runs bounded cleanup once',
        'recovery.timeout'
      ),
      testCase(
        'fails security-closed when a timed-out adapter never becomes quiescent',
        'recovery.timeout'
      ),
    ]),
  }),
  Object.freeze({
    id: 'recovery-browser-process',
    packageName: '@prodivix/runtime-browser',
    files: Object.freeze(['src/browserProjectTestRunner.conformance.test.ts']),
    cases: Object.freeze([
      testCase(
        'kills only the owned test process on cancellation and timeout',
        'recovery.cancel',
        'recovery.timeout'
      ),
      testCase(
        'does not publish cancellation terminal before bounded process cleanup',
        'recovery.cancel'
      ),
      testCase(
        'fails closed when asynchronous timeout cleanup rejects',
        'recovery.timeout'
      ),
    ]),
  }),
  Object.freeze({
    id: 'recovery-remote-protocol',
    packageName: '@prodivix/runtime-remote',
    files: Object.freeze([
      'src/remoteExecutionControlPlane.conformance.test.ts',
      'src/remoteExecutionClient.conformance.test.ts',
      'src/remoteExecutionProvider.conformance.test.ts',
    ]),
    cases: Object.freeze([
      testCase(
        'reclaims expired work with a new fencing token and rejects the old lease',
        'recovery.worker-loss'
      ),
      testCase(
        'replays from a confirmed cursor and bounds retry across disconnects',
        'recovery.cursor-resume'
      ),
      testCase(
        'rejects cursor gaps and provider identity drift instead of guessing',
        'recovery.out-of-order'
      ),
      testCase(
        'reconnects the same execution and replays from the last confirmed cursor',
        'recovery.cursor-resume'
      ),
      testCase(
        'accepts an exact boundary duplicate once and rejects payload drift',
        'recovery.duplicate'
      ),
      testCase(
        'fails closed on a remote event cursor gap',
        'recovery.out-of-order'
      ),
      testCase(
        'fails closed on a remote event out-of-order cursor',
        'recovery.out-of-order'
      ),
      testCase(
        'deduplicates concurrent resume, accepts its anchor duplicate, and fences a delayed old read',
        'recovery.cursor-resume',
        'recovery.duplicate',
        'recovery.out-of-order'
      ),
    ]),
  }),
] satisfies readonly GoldenG3V6ControlledDimensionSuite[]);

const expectedPassedCaseCount = GOLDEN_G3_V6_CONTROLLED_DIMENSION_SUITES.reduce(
  (count, suite) => count + suite.cases.length,
  0
);

const manifestIdentity = Object.freeze({
  format: 'prodivix.golden-g3-v6-controlled-dimensions.v1',
  role: 'scenario-internal-controlled-profiles',
  planAxis: false,
  controlledDimensionIds: GOLDEN_G3_V6_CONTROLLED_DIMENSION_IDS,
  suites: GOLDEN_G3_V6_CONTROLLED_DIMENSION_SUITES,
  expectedPassedCaseCount,
  expectedOwnerPassedCaseCount: 127,
});

export const GOLDEN_G3_V6_CONTROLLED_DIMENSION_MANIFEST = Object.freeze({
  ...manifestIdentity,
  manifestDigest: digestVerificationValue(manifestIdentity),
});
