import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  compareVerificationText,
  digestVerificationValue,
  type VerificationAbortSignal,
  type VerificationAdapterInputRef,
} from '@prodivix/verification';
import {
  assertUniqueIdentities,
  BrowserPrivatePayloadError,
  decodePrivateJson,
  strictArray,
  strictBoolean,
  strictEnum,
  strictIdentifier,
  strictObject,
  strictSafeInteger,
  strictSha256Digest,
} from './privateBoundary';
import {
  BROWSER_SECURITY_CORE_RESOLVED_RULE_IDS,
  createBrowserSecurityPolicyDigest,
  decodeBrowserOwnedSecurityPayload,
  decodeBrowserSecurityPayload,
  decodeSecurityCheckObservation,
  type BrowserSecurityCoreResolvedRuleId,
  type BrowserSecurityHardRuleId,
  type BrowserSecurityPolicyProfile,
  type DecodedBrowserSecurityPayload,
  type SecurityCheckObservation,
} from './security';

export const BROWSER_SECURITY_OBSERVATION_SET_FORMAT =
  'prodivix.security-observation-set' as const;
export const BROWSER_SECURITY_OBSERVATION_SET_VERSION = 1 as const;
export const BROWSER_SECURITY_OBSERVATION_SET_MEDIA_TYPE =
  'application/vnd.prodivix.security-observation-set+json' as const;

const MAXIMUM_OBSERVATION_SET_BYTES = 256 * 1024;

export const BROWSER_SECURITY_CORE_OBSERVATION_SOURCES = Object.freeze({
  'security.secret-canary': Object.freeze({
    ownerId: '@prodivix/runtime-core',
    sourceKind: 'execution-secret-inspection',
  }),
  'security.output-artifact-uninspectable': Object.freeze({
    ownerId: '@prodivix/runtime-core',
    sourceKind: 'execution-artifact-inspection',
  }),
  'security.production-probe-leak': Object.freeze({
    ownerId: '@prodivix/prodivix-compiler',
    sourceKind: 'production-bundle-probe-scan',
  }),
} as const);

export type BrowserSecurityObservationSetBinding = Readonly<{
  cellId: string;
  attemptId: string;
  generation: number;
  executableSnapshotDigest: string;
  runtimeEnvironmentDigest: string;
  controlProfileDigest: string;
}>;

export type BrowserSecurityObservationSource = Readonly<{
  ownerId: (typeof BROWSER_SECURITY_CORE_OBSERVATION_SOURCES)[BrowserSecurityCoreResolvedRuleId]['ownerId'];
  sourceKind: (typeof BROWSER_SECURITY_CORE_OBSERVATION_SOURCES)[BrowserSecurityCoreResolvedRuleId]['sourceKind'];
  sourceDigest: string;
}>;

export type BrowserSecurityOwnedObservation = Readonly<{
  source: BrowserSecurityObservationSource;
  observation: SecurityCheckObservation &
    Readonly<{
      ruleId: BrowserSecurityCoreResolvedRuleId;
      sourceTraceDigest: string;
    }>;
}>;

export type BrowserSecurityObservationSet = Readonly<{
  format: typeof BROWSER_SECURITY_OBSERVATION_SET_FORMAT;
  version: typeof BROWSER_SECURITY_OBSERVATION_SET_VERSION;
  complete: true;
  binding: BrowserSecurityObservationSetBinding;
  observations: readonly BrowserSecurityOwnedObservation[];
}>;

export type BrowserSecurityObservationAuthorityPort = Readonly<{
  resolve(
    input: Readonly<{
      ruleId: BrowserSecurityCoreResolvedRuleId;
      source: BrowserSecurityObservationSource;
      binding: BrowserSecurityObservationSetBinding;
    }>,
    signal: VerificationAbortSignal
  ): Promise<BrowserSecurityOwnedObservation | undefined>;
}>;

const fail = (path: string, message: string): never => {
  throw new BrowserPrivatePayloadError('result-drift', path, message);
};

const sourceText = (source: string | Uint8Array): string =>
  typeof source === 'string'
    ? source
    : new TextDecoder('utf-8', { fatal: true }).decode(source);

const normalizeBinding = (
  value: unknown
): BrowserSecurityObservationSetBinding => {
  const binding = strictObject(value, '$.binding', [
    'cellId',
    'attemptId',
    'generation',
    'executableSnapshotDigest',
    'runtimeEnvironmentDigest',
    'controlProfileDigest',
  ]);
  return Object.freeze({
    cellId: strictIdentifier(binding.cellId, '$.binding.cellId'),
    attemptId: strictIdentifier(binding.attemptId, '$.binding.attemptId'),
    generation: strictSafeInteger(binding.generation, '$.binding.generation', {
      minimum: 1,
      maximum: Number.MAX_SAFE_INTEGER,
    }),
    executableSnapshotDigest: strictSha256Digest(
      binding.executableSnapshotDigest,
      '$.binding.executableSnapshotDigest'
    ),
    runtimeEnvironmentDigest: strictSha256Digest(
      binding.runtimeEnvironmentDigest,
      '$.binding.runtimeEnvironmentDigest'
    ),
    controlProfileDigest: strictSha256Digest(
      binding.controlProfileDigest,
      '$.binding.controlProfileDigest'
    ),
  });
};

const normalizeOwnedObservation = (
  value: unknown,
  index: number
): BrowserSecurityOwnedObservation => {
  const path = `$.observations[${index}]`;
  const entry = strictObject(value, path, ['source', 'observation']);
  const observation = decodeSecurityCheckObservation(
    entry.observation,
    `${path}.observation`
  );
  const ruleId = strictEnum(
    observation.ruleId,
    `${path}.observation.ruleId`,
    BROWSER_SECURITY_CORE_RESOLVED_RULE_IDS
  ) as BrowserSecurityCoreResolvedRuleId;
  const expectedSource = BROWSER_SECURITY_CORE_OBSERVATION_SOURCES[ruleId];
  const source = strictObject(entry.source, `${path}.source`, [
    'ownerId',
    'sourceKind',
    'sourceDigest',
  ]);
  const ownerId = strictEnum(source.ownerId, `${path}.source.ownerId`, [
    expectedSource.ownerId,
  ] as const);
  const sourceKind = strictEnum(
    source.sourceKind,
    `${path}.source.sourceKind`,
    [expectedSource.sourceKind] as const
  );
  const sourceDigest = strictSha256Digest(
    source.sourceDigest,
    `${path}.source.sourceDigest`
  );
  if (observation.sourceTraceDigest !== sourceDigest) {
    fail(
      `${path}.observation.sourceTraceDigest`,
      'Core-resolved security observation must retain its exact owner source digest.'
    );
  }
  return Object.freeze({
    source: Object.freeze({ ownerId, sourceKind, sourceDigest }),
    observation: observation as BrowserSecurityOwnedObservation['observation'],
  });
};

const decodeObservationSetValue = (
  source: string | Uint8Array | unknown
): BrowserSecurityObservationSet => {
  if (
    (typeof source === 'string' &&
      new TextEncoder().encode(source).byteLength >
        MAXIMUM_OBSERVATION_SET_BYTES) ||
    (source instanceof Uint8Array &&
      source.byteLength > MAXIMUM_OBSERVATION_SET_BYTES)
  ) {
    throw new BrowserPrivatePayloadError(
      'input-too-large',
      '$',
      `Security observation set exceeds ${MAXIMUM_OBSERVATION_SET_BYTES} bytes.`
    );
  }
  const decoded = decodePrivateJson(source, 'security observation set');
  const root = strictObject(decoded, '$', [
    'format',
    'version',
    'complete',
    'binding',
    'observations',
  ]);
  strictEnum(root.format, '$.format', [
    BROWSER_SECURITY_OBSERVATION_SET_FORMAT,
  ] as const);
  if (root.version !== BROWSER_SECURITY_OBSERVATION_SET_VERSION) {
    throw new BrowserPrivatePayloadError(
      'partial-result',
      '$.version',
      'Security observation set uses an unsupported schema version.'
    );
  }
  if (!strictBoolean(root.complete, '$.complete')) {
    throw new BrowserPrivatePayloadError(
      'partial-result',
      '$.complete',
      'Security observation set is partial.'
    );
  }
  const observations = strictArray(
    root.observations,
    '$.observations',
    BROWSER_SECURITY_CORE_RESOLVED_RULE_IDS.length
  ).map(normalizeOwnedObservation);
  assertUniqueIdentities(
    observations,
    ({ observation }) => observation.ruleId,
    '$.observations'
  );
  const observed = new Set<BrowserSecurityHardRuleId>(
    observations.map(({ observation }) => observation.ruleId)
  );
  const missing = BROWSER_SECURITY_CORE_RESOLVED_RULE_IDS.filter(
    (ruleId) => !observed.has(ruleId)
  );
  if (missing.length > 0) {
    throw new BrowserPrivatePayloadError(
      'partial-result',
      '$.observations',
      `Security observation set is missing Core-owned rules: ${missing.join(', ')}.`
    );
  }
  return Object.freeze({
    format: BROWSER_SECURITY_OBSERVATION_SET_FORMAT,
    version: BROWSER_SECURITY_OBSERVATION_SET_VERSION,
    complete: true,
    binding: normalizeBinding(root.binding),
    observations: Object.freeze(
      [...observations].sort((left, right) =>
        compareVerificationText(
          left.observation.ruleId,
          right.observation.ruleId
        )
      )
    ),
  });
};

export const decodeBrowserSecurityObservationSet = (
  source: string | Uint8Array | unknown
): BrowserSecurityObservationSet => {
  let decoded: BrowserSecurityObservationSet;
  try {
    decoded = decodeObservationSetValue(source);
  } catch (error) {
    if (
      error instanceof TypeError &&
      !(error instanceof BrowserPrivatePayloadError)
    ) {
      throw new BrowserPrivatePayloadError(
        'invalid-json',
        '$',
        'Security observation set is not valid canonical UTF-8 JSON.',
        { cause: error }
      );
    }
    throw error;
  }
  if (
    (typeof source === 'string' || source instanceof Uint8Array) &&
    canonicalJsonText(decoded) !== sourceText(source)
  ) {
    throw new BrowserPrivatePayloadError(
      'invalid-json',
      '$',
      'Security observation set bytes must use canonical JSON.'
    );
  }
  return decoded;
};

export const encodeBrowserSecurityObservationSet = (
  input: BrowserSecurityObservationSet
): Uint8Array => {
  const normalized = decodeBrowserSecurityObservationSet(input);
  const bytes = new TextEncoder().encode(canonicalJsonText(normalized));
  if (bytes.byteLength > MAXIMUM_OBSERVATION_SET_BYTES) {
    throw new BrowserPrivatePayloadError(
      'input-too-large',
      '$',
      `Security observation set exceeds ${MAXIMUM_OBSERVATION_SET_BYTES} bytes.`
    );
  }
  return bytes;
};

const digestBytes = (bytes: Uint8Array): string =>
  `sha256-${bytesToHex(sha256(bytes))}`;

export const createBrowserSecurityObservationSetInputRef = (
  id: string,
  input: BrowserSecurityObservationSet
): Readonly<{
  ref: VerificationAdapterInputRef;
  bytes: Uint8Array;
}> => {
  const bytes = encodeBrowserSecurityObservationSet(input);
  return Object.freeze({
    ref: Object.freeze({
      id: strictIdentifier(id, '$.id'),
      kind: 'security-observation-set',
      digest: digestBytes(bytes),
      size: bytes.byteLength,
      mediaType: BROWSER_SECURITY_OBSERVATION_SET_MEDIA_TYPE,
    }),
    bytes,
  });
};

/**
 * Resolves each declared source through its real G2 owner. A canonical bundle
 * is not authoritative by itself; no adapter path may skip this comparison.
 */
export const assertBrowserSecurityObservationSetAuthority = async (
  observationSetInput: BrowserSecurityObservationSet,
  authority: BrowserSecurityObservationAuthorityPort,
  signal: VerificationAbortSignal
): Promise<BrowserSecurityObservationSet> => {
  const observationSet =
    decodeBrowserSecurityObservationSet(observationSetInput);
  for (let index = 0; index < observationSet.observations.length; index += 1) {
    const expected = observationSet.observations[index]!;
    const resolved = await authority.resolve(
      Object.freeze({
        ruleId: expected.observation.ruleId,
        source: expected.source,
        binding: observationSet.binding,
      }),
      signal
    );
    if (resolved === undefined) {
      fail(
        `$.observations[${index}].source`,
        `Security owner did not resolve source "${expected.source.sourceDigest}".`
      );
    }
    const normalized = normalizeOwnedObservation(resolved, index);
    if (!sameCanonicalJson(normalized, expected)) {
      fail(
        `$.observations[${index}]`,
        `Security owner resolution drifted for "${expected.observation.ruleId}".`
      );
    }
  }
  return observationSet;
};

const AGGREGATE_SCHEMA_DIGEST = digestVerificationValue({
  format: 'prodivix.browser-security-pre-finalization-report',
  version: 1,
});

const expectedCheckByRule = (
  policy: BrowserSecurityPolicyProfile
): ReadonlyMap<
  BrowserSecurityHardRuleId,
  BrowserSecurityPolicyProfile['expectedChecks'][number]
> => {
  createBrowserSecurityPolicyDigest(policy);
  return new Map(policy.expectedChecks.map((check) => [check.ruleId, check]));
};

/**
 * Joins the browser-owned four checks with the exact Core-resolved three.
 * Neither side may substitute observations owned by the other.
 */
export const composeBrowserSecurityPayload = (
  browserSource: string | Uint8Array | unknown,
  observationSetSource: string | Uint8Array | unknown,
  policy: BrowserSecurityPolicyProfile
): DecodedBrowserSecurityPayload => {
  const browser = decodeBrowserOwnedSecurityPayload(browserSource);
  const observationSet =
    decodeBrowserSecurityObservationSet(observationSetSource);
  const expected = expectedCheckByRule(policy);
  const checks = [
    ...browser.checks,
    ...observationSet.observations.map(({ observation }) => observation),
  ];
  for (const check of checks) {
    const policyCheck = expected.get(check.ruleId);
    if (
      policyCheck === undefined ||
      policyCheck.targetId !== check.targetId ||
      policyCheck.expectedDigest !== check.expectedDigest
    ) {
      fail(
        '$.checks',
        `Security observation "${check.ruleId}" drifted from its canonical policy identity.`
      );
    }
  }
  return decodeBrowserSecurityPayload({
    format: 'prodivix.browser-security-pre-finalization-report',
    version: 1,
    tool: {
      name: 'prodivix-security-aggregate',
      version: '1.0.0',
      schemaDigest: AGGREGATE_SCHEMA_DIGEST,
    },
    complete: true,
    checks,
  });
};
