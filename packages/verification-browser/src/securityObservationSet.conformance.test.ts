import { VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS } from '@prodivix/verification';
import { describe, expect, it } from 'vitest';
import {
  BROWSER_SECURITY_BROWSER_OWNED_RULE_IDS,
  BROWSER_SECURITY_ADAPTER_OBSERVED_RULE_IDS,
  BROWSER_SECURITY_CORE_RESOLVED_RULE_IDS,
  type BrowserSecurityCoreResolvedRuleId,
  type BrowserSecurityHardRuleId,
  type BrowserSecurityPolicyProfile,
  type SecurityCheckObservation,
} from './security';
import {
  BROWSER_SECURITY_CORE_OBSERVATION_SOURCES,
  BROWSER_SECURITY_OBSERVATION_SET_MEDIA_TYPE,
  assertBrowserSecurityObservationSetAuthority,
  composeBrowserSecurityPayload,
  createBrowserSecurityObservationSetInputRef,
  decodeBrowserSecurityObservationSet,
  encodeBrowserSecurityObservationSet,
  type BrowserSecurityObservationSet,
  type BrowserSecurityObservationAuthorityPort,
} from './securityObservationSet';

const sha = (character: string): string => `sha256-${character.repeat(64)}`;

const collectorFor = (
  ruleId: BrowserSecurityHardRuleId
): BrowserSecurityPolicyProfile['expectedChecks'][number]['collector'] =>
  (
    ({
      'security.secret-canary': 'core-resolved-observation',
      'security.unexpected-network': 'browser-network',
      'security.csp-policy': 'response-csp',
      'security.permissions-policy': 'response-permissions-policy',
      'security.sandbox-isolation': 'browser-sandbox',
      'security.production-probe-leak': 'core-resolved-observation',
      'security.artifact-digest-drift': 'core-finalization',
      'security.cleanup-residual': 'core-finalization',
      'security.output-artifact-uninspectable': 'core-resolved-observation',
    }) as const
  )[ruleId];

const policy = (): BrowserSecurityPolicyProfile => ({
  allowedOrigins: ['https://app.example.test'],
  productionProbeMarkers: ['__PRODIVIX_VERIFY_ONLY_CANARY_V1__'],
  expectedChecks: VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS.map((ruleId) => ({
    ruleId,
    targetId: `target.${ruleId.slice('security.'.length)}`,
    expectedDigest: sha('a'),
    collector: collectorFor(ruleId),
  })),
});

const cleanObservation = (
  ruleId: BrowserSecurityHardRuleId,
  sourceTraceDigest?: string
): SecurityCheckObservation => ({
  ruleId,
  state: 'complete',
  targetId: `target.${ruleId.slice('security.'.length)}`,
  expectedDigest: sha('a'),
  observedDigest: sha('a'),
  violationCount: 0,
  diagnosticCodes: [],
  ...(sourceTraceDigest === undefined ? {} : { sourceTraceDigest }),
});

const observationSet = (): BrowserSecurityObservationSet => ({
  format: 'prodivix.security-observation-set',
  version: 1,
  complete: true,
  binding: {
    cellId: 'security-cell',
    attemptId: 'attempt-1',
    generation: 1,
    executableSnapshotDigest: sha('1'),
    runtimeEnvironmentDigest: sha('2'),
    controlProfileDigest: sha('3'),
  },
  observations: BROWSER_SECURITY_CORE_RESOLVED_RULE_IDS.map((ruleId) => {
    const source = BROWSER_SECURITY_CORE_OBSERVATION_SOURCES[ruleId];
    const sourceDigest = sha('c');
    return {
      source: { ...source, sourceDigest },
      observation: {
        ...cleanObservation(ruleId, sourceDigest),
        ruleId,
        sourceTraceDigest: sourceDigest,
      },
    };
  }),
});

const browserOwnedReport = (
  checks: readonly SecurityCheckObservation[] = BROWSER_SECURITY_BROWSER_OWNED_RULE_IDS.map(
    (ruleId) => cleanObservation(ruleId)
  )
) => ({
  format: 'prodivix.browser-owned-security-report',
  version: 1,
  tool: {
    name: 'playwright',
    version: '1.61.1',
    schemaDigest: sha('b'),
  },
  complete: true,
  checks,
});

const signal = Object.freeze({
  aborted: false,
  subscribe: () => () => undefined,
});

describe('Core-resolved browser security observation set', () => {
  it('encodes a canonical content-addressed input with explicit fixed owners', () => {
    const encoded = encodeBrowserSecurityObservationSet(observationSet());
    const decoded = decodeBrowserSecurityObservationSet(encoded);
    expect(decoded.observations).toHaveLength(3);
    expect(
      decoded.observations.map(({ observation }) => observation.ruleId)
    ).toEqual(BROWSER_SECURITY_CORE_RESOLVED_RULE_IDS);
    for (const entry of decoded.observations) {
      expect(entry.source).toMatchObject(
        BROWSER_SECURITY_CORE_OBSERVATION_SOURCES[
          entry.observation.ruleId as BrowserSecurityCoreResolvedRuleId
        ]
      );
      expect(entry.observation.sourceTraceDigest).toBe(
        entry.source.sourceDigest
      );
    }

    const created = createBrowserSecurityObservationSetInputRef(
      'security-observations',
      observationSet()
    );
    expect(created.ref).toMatchObject({
      kind: 'security-observation-set',
      mediaType: BROWSER_SECURITY_OBSERVATION_SET_MEDIA_TYPE,
      size: created.bytes.byteLength,
    });
    expect(created.ref.digest).toMatch(/^sha256-[0-9a-f]{64}$/u);
  });

  it('composes only the browser-owned four with the Core-resolved three', () => {
    const result = composeBrowserSecurityPayload(
      browserOwnedReport(),
      observationSet(),
      policy()
    );
    expect(result.checks).toHaveLength(7);
    expect(result.checks.map(({ ruleId }) => ruleId)).toEqual(
      BROWSER_SECURITY_ADAPTER_OBSERVED_RULE_IDS
    );
  });

  it('requires each self-described source to resolve through its real owner', async () => {
    const set = observationSet();
    const authority: BrowserSecurityObservationAuthorityPort = {
      resolve: async ({ ruleId }) =>
        set.observations.find(
          ({ observation }) => observation.ruleId === ruleId
        ),
    };
    await expect(
      assertBrowserSecurityObservationSetAuthority(set, authority, signal)
    ).resolves.toEqual(set);

    const forgedCleanSet = observationSet();
    const actualViolation = {
      ...forgedCleanSet.observations[0]!,
      observation: {
        ...forgedCleanSet.observations[0]!.observation,
        observedDigest: sha('f'),
        violationCount: 1,
      },
    };
    await expect(
      assertBrowserSecurityObservationSetAuthority(
        forgedCleanSet,
        {
          resolve: async ({ ruleId }) =>
            ruleId === actualViolation.observation.ruleId
              ? actualViolation
              : forgedCleanSet.observations.find(
                  ({ observation }) => observation.ruleId === ruleId
                ),
        },
        signal
      )
    ).rejects.toThrow('owner resolution drifted');
    await expect(
      assertBrowserSecurityObservationSetAuthority(
        set,
        { resolve: async () => undefined },
        signal
      )
    ).rejects.toThrow('did not resolve source');
  });

  it('rejects partial, owner-drifted, and source-drifted observation sets', () => {
    expect(() =>
      decodeBrowserSecurityObservationSet({
        ...observationSet(),
        binding: {
          ...observationSet().binding,
          generation: 0,
        },
      })
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-field',
        path: '$.binding.generation',
      })
    );

    expect(() =>
      decodeBrowserSecurityObservationSet({
        ...observationSet(),
        observations: observationSet().observations.slice(1),
      })
    ).toThrowError(expect.objectContaining({ code: 'partial-result' }));

    const wrongOwner = observationSet().observations.map((entry) =>
      entry.observation.ruleId === 'security.secret-canary'
        ? {
            ...entry,
            source: { ...entry.source, ownerId: '@prodivix/verification' },
          }
        : entry
    );
    expect(() =>
      decodeBrowserSecurityObservationSet({
        ...observationSet(),
        observations: wrongOwner,
      })
    ).toThrowError(expect.objectContaining({ code: 'invalid-field' }));

    const wrongSourceDigest = observationSet().observations.map((entry) =>
      entry.observation.ruleId === 'security.output-artifact-uninspectable'
        ? {
            ...entry,
            source: { ...entry.source, sourceDigest: sha('d') },
          }
        : entry
    );
    expect(() =>
      decodeBrowserSecurityObservationSet({
        ...observationSet(),
        observations: wrongSourceDigest,
      })
    ).toThrowError(expect.objectContaining({ code: 'result-drift' }));
  });

  it('rejects policy drift and any browser attempt to self-report a Core rule', () => {
    const drifted = observationSet().observations.map((entry) =>
      entry.observation.ruleId === 'security.production-probe-leak'
        ? {
            ...entry,
            observation: {
              ...entry.observation,
              targetId: 'target.forged-clean',
            },
          }
        : entry
    );
    expect(() =>
      composeBrowserSecurityPayload(
        browserOwnedReport(),
        { ...observationSet(), observations: drifted },
        policy()
      )
    ).toThrowError(expect.objectContaining({ code: 'result-drift' }));

    expect(() =>
      composeBrowserSecurityPayload(
        browserOwnedReport([
          ...browserOwnedReport().checks,
          cleanObservation('security.secret-canary', sha('c')),
        ]),
        observationSet(),
        policy()
      )
    ).toThrow('cannot provide Core-owned rule');
  });

  it('rejects non-canonical bytes instead of admitting an alternate digest', () => {
    const canonical = new TextDecoder().decode(
      encodeBrowserSecurityObservationSet(observationSet())
    );
    expect(() =>
      decodeBrowserSecurityObservationSet(` ${canonical}`)
    ).toThrowError(expect.objectContaining({ code: 'invalid-json' }));
  });
});
