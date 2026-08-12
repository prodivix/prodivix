import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import type { CanonicalDigest } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type { AgentCapabilityProbeProfileId } from '../providers/agentCapabilityProbeProgram';
import type { AgentCapabilityProbeProviderResourceCleanupReceipt } from '../providers/agentCapabilityProbeProviderResource';
import type {
  AgentEvaluationProductionCapabilityProbeEvidence,
  AgentEvaluationRuntimeFactSourceAuthority,
  AgentModelEvaluationPlan,
} from './agentEvaluation.types';

export const AGENT_PRODUCTION_EVALUATION_QUALIFICATION_AUTHORITY_BUNDLE_FORMAT =
  'prodivix.agent-production-evaluation-qualification-authority-bundle' as const;
export const AGENT_PRODUCTION_EVALUATION_QUALIFICATION_AUTHORITY_BUNDLE_VERSION =
  1 as const;

export const AGENT_EVALUATION_QUALIFICATION_AUTHORITY_NATIVE_PROTOCOLS =
  Object.freeze([
    'anthropic-messages',
    'gemini-interactions',
    'openai-responses',
  ] as const);

export const AGENT_EVALUATION_QUALIFICATION_AUTHORITY_OPTIONAL_PROFILES =
  Object.freeze([
    'g4-provider-background-job',
    'g4-provider-hosted-retrieval-core',
    'g4-provider-hosted-retrieval-document',
    'g4-provider-isolated-cache',
    'g4-provider-parallel-tool',
    'g4-provider-reasoning-continuation',
  ] as const satisfies readonly AgentCapabilityProbeProfileId[]);

export const AGENT_EVALUATION_QUALIFICATION_AUTHORITY_RUNTIME_PROFILES =
  Object.freeze([
    'g4-provider-background-job',
    'g4-provider-hosted-retrieval-core',
    'g4-provider-hosted-retrieval-document',
    'g4-provider-isolated-cache',
    'g4-provider-reasoning-continuation',
  ] as const);

type NativeProtocol =
  (typeof AGENT_EVALUATION_QUALIFICATION_AUTHORITY_NATIVE_PROTOCOLS)[number];
type RuntimeProfile =
  (typeof AGENT_EVALUATION_QUALIFICATION_AUTHORITY_RUNTIME_PROFILES)[number];
type ProviderResourceProtocol = Exclude<NativeProtocol, 'anthropic-messages'>;
type ProviderResourceProfile =
  'g4-provider-hosted-retrieval-core' | 'g4-provider-hosted-retrieval-document';

export type AgentEvaluationQualificationProbeAuthorityDigestEntry = Readonly<{
  protocolFamily: NativeProtocol;
  profileId: AgentCapabilityProbeProfileId;
  evidenceDigest: CanonicalDigest;
}>;

export type AgentEvaluationQualificationRuntimeAuthorityDigestEntry = Readonly<{
  protocolFamily: NativeProtocol;
  profileId: RuntimeProfile;
  authorityDigest: CanonicalDigest;
}>;

export type AgentEvaluationQualificationProviderResourceCleanupDigestEntry =
  Readonly<{
    protocolFamily: ProviderResourceProtocol;
    profileId: ProviderResourceProfile;
    cleanupReceiptDigest: CanonicalDigest;
  }>;

export type AgentEvaluationQualificationAuthorityBundleCommitment = Readonly<{
  capabilityProbeAuthoritySetDigest: CanonicalDigest;
  runtimeFactSourceAuthoritySetDigest: CanonicalDigest;
  providerResourceCleanupReceiptSetDigest: CanonicalDigest;
  bundleDigest: CanonicalDigest;
}>;

export type AgentEvaluationResolvedQualificationAuthorityBundle = Readonly<{
  capabilityProbeAuthorities: readonly Readonly<{
    protocolFamily: NativeProtocol;
    profileId: AgentCapabilityProbeProfileId;
    evidence: AgentEvaluationProductionCapabilityProbeEvidence;
  }>[];
  runtimeFactSourceAuthorities: readonly Readonly<{
    protocolFamily: NativeProtocol;
    profileId: RuntimeProfile;
    authority: AgentEvaluationRuntimeFactSourceAuthority;
  }>[];
  providerResourceCleanupReceipts: readonly Readonly<{
    protocolFamily: ProviderResourceProtocol;
    profileId: ProviderResourceProfile;
    receipt: AgentCapabilityProbeProviderResourceCleanupReceipt;
  }>[];
  capabilityProbeAuthoritySetDigest: CanonicalDigest;
  runtimeFactSourceAuthoritySetDigest: CanonicalDigest;
  providerResourceCleanupReceiptSetDigest: CanonicalDigest;
  bundleDigest: CanonicalDigest;
}>;

const entryKey = (
  entry: Readonly<{ protocolFamily: string; profileId: string }>
) => `${entry.protocolFamily}\u0000${entry.profileId}`;

const canonicalEntries = <
  T extends Readonly<{ protocolFamily: string; profileId: string }>,
>(
  entries: readonly T[]
): readonly T[] =>
  Object.freeze(
    [...entries].sort((left, right) =>
      compareUnicodeCodePoints(entryKey(left), entryKey(right))
    )
  );

const expectedKeys = (profiles: readonly string[]): readonly string[] =>
  Object.freeze(
    AGENT_EVALUATION_QUALIFICATION_AUTHORITY_NATIVE_PROTOCOLS.flatMap(
      (protocolFamily) =>
        profiles.map((profileId) => `${protocolFamily}\u0000${profileId}`)
    ).sort(compareUnicodeCodePoints)
  );

const expectedProviderResourceCleanupKeys = (): readonly string[] =>
  Object.freeze(
    (['gemini-interactions', 'openai-responses'] as const)
      .flatMap((protocolFamily) =>
        (
          [
            'g4-provider-hosted-retrieval-core',
            'g4-provider-hosted-retrieval-document',
          ] as const
        ).map((profileId) => `${protocolFamily}\u0000${profileId}`)
      )
      .sort(compareUnicodeCodePoints)
  );

export const createAgentEvaluationQualificationAuthorityBundleCommitment = (
  probeAuthorities: readonly AgentEvaluationQualificationProbeAuthorityDigestEntry[],
  runtimeAuthorities: readonly AgentEvaluationQualificationRuntimeAuthorityDigestEntry[],
  providerResourceCleanupReceipts: readonly AgentEvaluationQualificationProviderResourceCleanupDigestEntry[]
): AgentEvaluationQualificationAuthorityBundleCommitment => {
  const probes = canonicalEntries(probeAuthorities);
  const runtimes = canonicalEntries(runtimeAuthorities);
  const cleanups = canonicalEntries(providerResourceCleanupReceipts);
  if (
    !sameCanonicalJson(
      probes.map(entryKey),
      expectedKeys(AGENT_EVALUATION_QUALIFICATION_AUTHORITY_OPTIONAL_PROFILES)
    ) ||
    !sameCanonicalJson(
      runtimes.map(entryKey),
      expectedKeys(AGENT_EVALUATION_QUALIFICATION_AUTHORITY_RUNTIME_PROFILES)
    ) ||
    !sameCanonicalJson(
      cleanups.map(entryKey),
      expectedProviderResourceCleanupKeys()
    ) ||
    probes.some(
      ({ evidenceDigest }) => !isAgentCanonicalDigest(evidenceDigest)
    ) ||
    runtimes.some(
      ({ authorityDigest }) => !isAgentCanonicalDigest(authorityDigest)
    ) ||
    cleanups.some(
      ({ cleanupReceiptDigest }) =>
        !isAgentCanonicalDigest(cleanupReceiptDigest)
    )
  ) {
    throw new TypeError(
      'Qualification authority commitment requires 18 exact probe admissions, 15 exact runtime registrations, and 4 exact provider-resource cleanup receipts.'
    );
  }
  const capabilityProbeAuthoritySetDigest = digestAgentCanonicalValue({
    authorities: probes,
  });
  const runtimeFactSourceAuthoritySetDigest = digestAgentCanonicalValue({
    authorities: runtimes,
  });
  const providerResourceCleanupReceiptSetDigest = digestAgentCanonicalValue({
    cleanupReceipts: cleanups,
  });
  const base = Object.freeze({
    format: AGENT_PRODUCTION_EVALUATION_QUALIFICATION_AUTHORITY_BUNDLE_FORMAT,
    version: AGENT_PRODUCTION_EVALUATION_QUALIFICATION_AUTHORITY_BUNDLE_VERSION,
    capabilityProbeAuthoritySetDigest,
    runtimeFactSourceAuthoritySetDigest,
    providerResourceCleanupReceiptSetDigest,
  });
  return Object.freeze({
    capabilityProbeAuthoritySetDigest,
    runtimeFactSourceAuthoritySetDigest,
    providerResourceCleanupReceiptSetDigest,
    bundleDigest: digestAgentCanonicalValue(base),
  });
};

export const resolveAgentProductionEvaluationQualificationAuthorityBundleFromPlan =
  (
    plan: Pick<AgentModelEvaluationPlan, 'capabilityQualificationTargets'>
  ): AgentEvaluationResolvedQualificationAuthorityBundle => {
    const optionalTargets = plan.capabilityQualificationTargets.filter(
      ({ optionalCapabilitySupportAuthority }) =>
        optionalCapabilitySupportAuthority !== undefined
    );
    const capabilityProbeAuthorities = canonicalEntries(
      optionalTargets.map((target) => {
        const authority = target.optionalCapabilitySupportAuthority!;
        if (
          authority.qualificationCapabilityProfileId !==
            target.capabilityProfileId ||
          authority.qualificationCapabilityProfileDigest !==
            target.capabilityProfileDigest ||
          authority.capabilityId !==
            authority.probeEvidence.probeProgram.profileProjection
              .capabilityId ||
          authority.probeEvidence.probeProgram.profileProjection
            .capabilityProfileId !== target.capabilityProfileId
        ) {
          throw new TypeError(
            'Qualification probe authority drifted from its target profile.'
          );
        }
        return Object.freeze({
          protocolFamily: target.protocolFamily as NativeProtocol,
          profileId:
            target.capabilityProfileId as AgentCapabilityProbeProfileId,
          evidence: authority.probeEvidence,
        });
      })
    );
    const runtimeFactSourceAuthorities = canonicalEntries(
      optionalTargets.flatMap((target) => {
        const authority = target.optionalCapabilitySupportAuthority!;
        const profileId =
          target.capabilityProfileId as AgentCapabilityProbeProfileId;
        const factBacked =
          AGENT_EVALUATION_QUALIFICATION_AUTHORITY_RUNTIME_PROFILES.includes(
            profileId as RuntimeProfile
          );
        if (
          factBacked !==
          (authority.runtimeFactSourceAuthority !== undefined)
        ) {
          throw new TypeError(
            'Qualification runtime authority presence drifted from its profile.'
          );
        }
        if (!factBacked) return [];
        const runtimeAuthority = authority.runtimeFactSourceAuthority!;
        if (
          runtimeAuthority.protocolFamily !== target.protocolFamily ||
          runtimeAuthority.providerConfigurationId !==
            target.providerConfigurationId ||
          runtimeAuthority.modelId !== target.modelId ||
          runtimeAuthority.modelLineageDigest !== target.modelLineageDigest ||
          runtimeAuthority.capabilityProfileId !== target.capabilityProfileId ||
          runtimeAuthority.capabilityProfileDigest !==
            target.capabilityProfileDigest ||
          runtimeAuthority.capabilityId !== authority.capabilityId
        ) {
          throw new TypeError(
            'Qualification runtime authority drifted from its target route.'
          );
        }
        return [
          Object.freeze({
            protocolFamily: target.protocolFamily as NativeProtocol,
            profileId: profileId as RuntimeProfile,
            authority: runtimeAuthority,
          }),
        ];
      })
    );
    const providerResourceCleanupReceipts = canonicalEntries(
      optionalTargets.flatMap((target) => {
        const authority = target.optionalCapabilitySupportAuthority!;
        const resourceBacked =
          target.protocolFamily !== 'anthropic-messages' &&
          target.capabilityProfileId !== 'g4-provider-parallel-tool' &&
          (target.capabilityProfileId === 'g4-provider-hosted-retrieval-core' ||
            target.capabilityProfileId ===
              'g4-provider-hosted-retrieval-document');
        if (
          resourceBacked !==
            (authority.probeProviderResourceAuthority !== undefined) ||
          resourceBacked !==
            (authority.probeProviderResourceDeletionAuthorityReceipt !==
              undefined) ||
          resourceBacked !==
            (authority.probeProviderResourceCleanupReceipt !== undefined)
        ) {
          throw new TypeError(
            'Qualification provider-resource cleanup authority presence drifted from its target profile.'
          );
        }
        if (!resourceBacked) return [];
        return [
          Object.freeze({
            protocolFamily: target.protocolFamily as ProviderResourceProtocol,
            profileId: target.capabilityProfileId as ProviderResourceProfile,
            receipt: authority.probeProviderResourceCleanupReceipt!,
          }),
        ];
      })
    );
    const commitment =
      createAgentEvaluationQualificationAuthorityBundleCommitment(
        capabilityProbeAuthorities.map(
          ({ protocolFamily, profileId, evidence }) =>
            Object.freeze({
              protocolFamily,
              profileId,
              evidenceDigest: evidence.evidenceDigest,
            })
        ),
        runtimeFactSourceAuthorities.map(
          ({ protocolFamily, profileId, authority }) =>
            Object.freeze({
              protocolFamily,
              profileId,
              authorityDigest: authority.authorityDigest,
            })
        ),
        providerResourceCleanupReceipts.map(
          ({ protocolFamily, profileId, receipt }) =>
            Object.freeze({
              protocolFamily,
              profileId,
              cleanupReceiptDigest: receipt.cleanupReceiptDigest,
            })
        )
      );
    if (
      optionalTargets.some(
        ({ optionalCapabilitySupportAuthority }) =>
          optionalCapabilitySupportAuthority!
            .qualificationAuthorityBundleDigest !== commitment.bundleDigest
      )
    ) {
      throw new TypeError(
        'Qualification authority bundle digest drifted across optional targets.'
      );
    }
    return Object.freeze({
      capabilityProbeAuthorities,
      runtimeFactSourceAuthorities,
      providerResourceCleanupReceipts,
      ...commitment,
    });
  };
