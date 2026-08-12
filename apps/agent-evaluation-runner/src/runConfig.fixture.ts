import {
  AGENT_PRODUCTION_EVALUATION_FACT_BACKED_OPTIONAL_CAPABILITY_PROFILES,
  AGENT_PRODUCTION_EVALUATION_OPTIONAL_CAPABILITY_PROFILES,
  AGENT_PRODUCTION_EVALUATION_PROBE_PROVIDER_RESOURCE_PROTOCOL_FAMILIES,
  G4_V8_OPTIONAL_CAPABILITY_EVALUATION_SLICES,
  G4_V8_MINIMUM_EVALUATION_CORPUS,
  createAgentCapabilityProbeProviderResourceAuthority,
  createAgentCapabilityProbeProviderResourceCleanupReceipt,
  createAgentCapabilityProbeProviderResourceCleanupResourceResult,
  createAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt,
  createAgentCapabilityProbeProviderResourceDeletionRequestProjection,
  createAgentEvaluationCorpusMaterialCatalog,
  createAgentEvaluationRestrictedMaterialLocator,
  createAgentEvaluationRuntimeFactSourceAuthority,
  createAgentModelLineage,
  createAgentProductionEvaluationProbeProviderResourceAuthorityBundle,
  createAgentProductionEvaluationQualificationAuthorityBundle,
  createAgentProviderAdapterIdentity,
  createAgentProviderConfigurationIdentity,
  digestAgentCanonicalValue,
  getG4V8PublicEvaluationCaseMaterials,
  resolveAgentProductionEvaluationNativeProviderIdentity,
  type AgentProductionEvaluationProbeProviderResourceAuthorityBundle,
  type AgentProductionEvaluationQualificationAuthorityBundle,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  createV8CapabilityProbeArchiveAuthority,
  isV8OptionalCapabilitySupported,
} from '../../../packages/ai/src/__tests__/agentV8Fixtures';
import {
  createAgentEvaluationProductionRunConfigDocument,
  decodeAgentEvaluationRunConfigQualificationTemplate,
  type AgentEvaluationRunConfigQualificationTemplate,
} from './runConfig';

const fixtureObservedAt = '2026-08-08T00:00:00.000Z';
const fixtureExpiresAt = '2026-08-16T00:00:00.000Z';
const qualificationBundleCache = new Map<
  string,
  AgentProductionEvaluationQualificationAuthorityBundle
>();
const probeProviderResourceAuthorityBundleCache = new Map<
  string,
  AgentProductionEvaluationProbeProviderResourceAuthorityBundle
>();
const materialCatalogDigestCache = new Map<
  string,
  Readonly<{
    caseSetDigest: CanonicalDigest;
    publicMaterialSetDigest: CanonicalDigest;
    restrictedMaterialManifestDigest: CanonicalDigest;
    catalogDigest: CanonicalDigest;
  }>
>();

const cloneRecord = (value: unknown): Record<string, unknown> =>
  structuredClone(value) as Record<string, unknown>;

const recordAt = (
  value: unknown,
  ...path: readonly string[]
): Record<string, unknown> => {
  let current = value;
  for (const key of path) {
    if (
      current === null ||
      typeof current !== 'object' ||
      Array.isArray(current)
    ) {
      throw new TypeError('Test run config record is invalid.');
    }
    current = (current as Record<string, unknown>)[key];
  }
  if (
    current === null ||
    typeof current !== 'object' ||
    Array.isArray(current)
  ) {
    throw new TypeError('Test run config record is invalid.');
  }
  return current as Record<string, unknown>;
};

/** Refreshes only canonical corpus roots in a mutable test template. */
export const refreshAgentEvaluationTestMaterialCatalogDigests = (
  source: Record<string, unknown>
): void => {
  const locators = recordAt(source, 'material').restrictedEnvelopeLocators;
  if (!Array.isArray(locators)) {
    throw new TypeError('Test restricted material locators are invalid.');
  }
  const locatorSetDigest = digestAgentCanonicalValue(locators);
  const cached = materialCatalogDigestCache.get(locatorSetDigest);
  if (cached) {
    Object.assign(recordAt(source, 'material', 'catalogDigests'), cached);
    return;
  }
  const caseById = new Map(
    G4_V8_MINIMUM_EVALUATION_CORPUS.cases.map((evaluationCase) => [
      evaluationCase.caseId,
      evaluationCase,
    ])
  );
  const restrictedLocators = locators.map((value) => {
    const input = recordAt({ value }, 'value');
    const evaluationCase = caseById.get(String(input.caseId));
    if (!evaluationCase) {
      throw new TypeError('Test restricted evaluation case is missing.');
    }
    return createAgentEvaluationRestrictedMaterialLocator(evaluationCase, {
      resolverRef: String(input.resolverRef),
      encryptedMaterialDigest: input.encryptedMaterialDigest as CanonicalDigest,
      encryptionPolicyDigest: input.encryptionPolicyDigest as CanonicalDigest,
    });
  });
  const catalog = createAgentEvaluationCorpusMaterialCatalog(
    G4_V8_MINIMUM_EVALUATION_CORPUS.cases,
    getG4V8PublicEvaluationCaseMaterials(),
    restrictedLocators
  );
  const catalogDigests = Object.freeze({
    caseSetDigest: catalog.caseSetDigest,
    publicMaterialSetDigest: catalog.publicMaterialSetDigest,
    restrictedMaterialManifestDigest: catalog.restrictedMaterialManifestDigest,
    catalogDigest: catalog.catalogDigest,
  });
  materialCatalogDigestCache.set(locatorSetDigest, catalogDigests);
  Object.assign(recordAt(source, 'material', 'catalogDigests'), catalogDigests);
};

const templateFor = (
  source: Record<string, unknown>
): AgentEvaluationRunConfigQualificationTemplate => {
  const template = cloneRecord(source);
  template.purpose = 'template';
  delete template.qualificationAuthorityBundle;
  delete template.probeProviderResourceAuthorityBundle;
  refreshAgentEvaluationTestMaterialCatalogDigests(template);
  return decodeAgentEvaluationRunConfigQualificationTemplate(template);
};

/** Test-only sealed authorities; excluded from the production build. */
export const createAgentEvaluationTestQualificationAuthorityBundle = (
  source: Record<string, unknown>
): AgentProductionEvaluationQualificationAuthorityBundle => {
  const template = templateFor(source);
  const cached = qualificationBundleCache.get(template.sourceConfigDigest);
  if (cached) return cached;
  const providerFixtures = template.nativeIdentities.map((identity) => {
    const adapter = createAgentProviderAdapterIdentity({
      adapterId: identity.adapter.adapterId,
      adapterVersion: identity.adapter.adapterVersion,
      protocolFamily: identity.protocolFamily,
      transportSchemaDigest: identity.adapter.transportSchemaDigest,
      eventNormalizationDigest: identity.adapter.eventNormalizationDigest,
    });
    const provider = createAgentProviderConfigurationIdentity({
      providerConfigurationId: identity.providerConfigurationId,
      providerOperatorId: identity.providerOperatorId,
      endpointClass: 'first-party-hosted',
      endpointProfileDigest: identity.endpointProfileDigest,
      providerRegion: identity.region,
      apiRevision: identity.apiRevision,
      adapter,
      dataPolicyDigest: identity.dataPolicyDigest,
    });
    const model = createAgentModelLineage({
      modelId: identity.model.modelId,
      modelFamilyId: identity.model.modelFamilyId,
      modelFamilyOwnerId: identity.model.modelFamilyOwnerId,
      immutableVersion: identity.model.immutableVersion,
      ...(identity.model.tokenizerDigest
        ? { tokenizerDigest: identity.model.tokenizerDigest }
        : {}),
      ...(identity.model.chatTemplateDigest
        ? { chatTemplateDigest: identity.model.chatTemplateDigest }
        : {}),
      ...(identity.model.runtimeBackendDigest
        ? { runtimeBackendDigest: identity.model.runtimeBackendDigest }
        : {}),
    });
    const capabilityProbeAuthorities = Object.freeze(
      Object.fromEntries(
        AGENT_PRODUCTION_EVALUATION_OPTIONAL_CAPABILITY_PROFILES.map(
          (profileId) => {
            const program = identity.capabilityProbePrograms[profileId];
            const slice = G4_V8_OPTIONAL_CAPABILITY_EVALUATION_SLICES.find(
              (candidate) => candidate.capabilityProfileId === profileId
            );
            if (!slice) {
              throw new TypeError('Test capability slice is missing.');
            }
            const archive = createV8CapabilityProbeArchiveAuthority({
              provider,
              model,
              slice,
              profileDigest: program.profileProjection.capabilityProfileDigest,
              supported: isV8OptionalCapabilitySupported(
                identity.protocolFamily,
                profileId
              ),
              declaredCapabilityProfileDigests:
                identity.declaredCapabilityProfileDigests,
              observedAt: fixtureObservedAt,
              expiresAt: fixtureExpiresAt,
              repositoryCommit: template.repositoryCommit,
              namespaceId: 'namespace.test.release',
            });
            return [profileId, archive.probeEvidence];
          }
        )
      )
    );
    const runtimeFactSourceAuthorities = Object.freeze(
      Object.fromEntries(
        AGENT_PRODUCTION_EVALUATION_FACT_BACKED_OPTIONAL_CAPABILITY_PROFILES.map(
          (profileId) => {
            const expected =
              identity.expectedRuntimeFactSourceIdentities[profileId];
            return [
              profileId,
              createAgentEvaluationRuntimeFactSourceAuthority({
                ...expected,
                registrationReceiptDigest: digestAgentCanonicalValue({
                  protocolFamily: identity.protocolFamily,
                  profileId,
                  registration: 'test',
                }),
              }),
            ];
          }
        )
      )
    );
    return Object.freeze({
      protocolFamily: identity.protocolFamily,
      capabilityProbeAuthorities,
      runtimeFactSourceAuthorities,
    });
  });
  const bundle = createAgentProductionEvaluationQualificationAuthorityBundle({
    capabilityProbeAuthorities: Object.freeze(
      Object.fromEntries(
        providerFixtures.map((entry) => [
          entry.protocolFamily,
          entry.capabilityProbeAuthorities,
        ])
      )
    ) as AgentProductionEvaluationQualificationAuthorityBundle['capabilityProbeAuthorities'],
    runtimeFactSourceAuthorities: Object.freeze(
      Object.fromEntries(
        providerFixtures.map((entry) => [
          entry.protocolFamily,
          entry.runtimeFactSourceAuthorities,
        ])
      )
    ) as AgentProductionEvaluationQualificationAuthorityBundle['runtimeFactSourceAuthorities'],
    providerResourceCleanupReceipts:
      createAgentEvaluationTestProbeProviderResourceAuthorityBundle(source)
        .cleanupReceipts,
  });
  qualificationBundleCache.set(template.sourceConfigDigest, bundle);
  return bundle;
};

/** Test-only provider resource authorities; excluded from production code. */
export const createAgentEvaluationTestProbeProviderResourceAuthorityBundle = (
  source: Record<string, unknown>
): AgentProductionEvaluationProbeProviderResourceAuthorityBundle => {
  const template = templateFor(source);
  const cached = probeProviderResourceAuthorityBundleCache.get(
    template.sourceConfigDigest
  );
  if (cached) return cached;
  const resourceFixtures =
    AGENT_PRODUCTION_EVALUATION_PROBE_PROVIDER_RESOURCE_PROTOCOL_FAMILIES.map(
      (protocolFamily) => {
        const identity = template.nativeIdentities.find(
          (candidate) => candidate.protocolFamily === protocolFamily
        );
        if (!identity) {
          throw new TypeError('Test provider resource identity is missing.');
        }
        const { provider, model } =
          resolveAgentProductionEvaluationNativeProviderIdentity(identity);
        return Object.freeze({
          protocolFamily: identity.protocolFamily,
          profiles: (
            [
              'g4-provider-hosted-retrieval-core',
              'g4-provider-hosted-retrieval-document',
            ] as const
          ).map((profileId) => {
            const authorityId = `${identity.protocolFamily}.${profileId}`;
            const providerResourceId = `resource.test.${authorityId}`;
            const requestDigest = digestAgentCanonicalValue({
              authorityId,
              kind: 'resource-registration-request',
            });
            const resourceManifestDigest = digestAgentCanonicalValue({
              authorityId,
              kind: 'resource-manifest',
            });
            const auxiliaryResourceIds =
              identity.protocolFamily === 'openai-responses'
                ? Object.freeze([`file.test.${authorityId}`])
                : Object.freeze([]);
            const deletionAuthorityReceipt =
              createAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt(
                {
                  resourceManifestDigest,
                  deletionRequestProjection:
                    createAgentCapabilityProbeProviderResourceDeletionRequestProjection(
                      {
                        requestDigest,
                        protocolFamily: identity.protocolFamily,
                        providerResourceId,
                        auxiliaryResourceIds,
                      }
                    ),
                  registeredAt: fixtureObservedAt,
                  expiresAt: fixtureExpiresAt,
                }
              );
            const authority =
              createAgentCapabilityProbeProviderResourceAuthority(
                identity.capabilityProbePrograms[profileId],
                {
                  protocolFamily: identity.protocolFamily,
                  providerConfigurationId: identity.providerConfigurationId,
                  modelId: identity.model.modelId,
                  modelLineageDigest: model.lineageDigest,
                  adapterDigest: provider.adapter.adapterDigest,
                  providerResourceId,
                  resourceManifestDigest,
                  contentUploadReceiptDigest: digestAgentCanonicalValue({
                    authorityId,
                    kind: 'content-upload-receipt',
                  }),
                  deletionAuthorityReceiptDigest:
                    deletionAuthorityReceipt.deletionAuthorityReceiptDigest,
                  registeredAt: fixtureObservedAt,
                  expiresAt: fixtureExpiresAt,
                }
              );
            const cleanupReceipt =
              createAgentCapabilityProbeProviderResourceCleanupReceipt({
                deletionAuthorityReceipt,
                resourceResults: [
                  Object.freeze({
                    resourceId: providerResourceId,
                    resourceRole: 'primary' as const,
                  }),
                  ...auxiliaryResourceIds.map((resourceId) =>
                    Object.freeze({
                      resourceId,
                      resourceRole: 'auxiliary' as const,
                    })
                  ),
                ].map(({ resourceId, resourceRole }) =>
                  createAgentCapabilityProbeProviderResourceCleanupResourceResult(
                    {
                      resourceId,
                      resourceRole,
                      outcome: 'deleted',
                      dispatchIntentDigest: digestAgentCanonicalValue({
                        authorityId,
                        resourceId,
                        phase: 'cleanup-dispatch',
                      }),
                      transportReceiptDigest: digestAgentCanonicalValue({
                        authorityId,
                        resourceId,
                        phase: 'cleanup-transport',
                      }),
                      completedAt: fixtureObservedAt,
                    }
                  )
                ),
              });
            return Object.freeze({
              profileId,
              authority,
              deletionAuthorityReceipt,
              cleanupReceipt,
            });
          }),
        });
      }
    );
  const mapByProfile = <T>(
    select: (entry: (typeof resourceFixtures)[number]['profiles'][number]) => T
  ) =>
    Object.freeze(
      Object.fromEntries(
        resourceFixtures.map(({ protocolFamily, profiles }) => [
          protocolFamily,
          Object.freeze(
            Object.fromEntries(
              profiles.map((entry) => [entry.profileId, select(entry)])
            )
          ),
        ])
      )
    );
  const authorities = mapByProfile(
    (entry) => entry.authority
  ) as AgentProductionEvaluationProbeProviderResourceAuthorityBundle['authorities'];
  const deletionAuthorityReceipts = mapByProfile(
    (entry) => entry.deletionAuthorityReceipt
  ) as AgentProductionEvaluationProbeProviderResourceAuthorityBundle['deletionAuthorityReceipts'];
  const cleanupReceipts = mapByProfile(
    (entry) => entry.cleanupReceipt
  ) as AgentProductionEvaluationProbeProviderResourceAuthorityBundle['cleanupReceipts'];
  const bundle =
    createAgentProductionEvaluationProbeProviderResourceAuthorityBundle({
      authorities,
      deletionAuthorityReceipts,
      cleanupReceipts,
    });
  probeProviderResourceAuthorityBundleCache.set(
    template.sourceConfigDigest,
    bundle
  );
  return bundle;
};

export const materializeAgentEvaluationTestProductionRunConfig = <
  T extends Record<string, unknown>,
>(
  source: T
): T => {
  const template = cloneRecord(source);
  template.purpose = 'template';
  delete template.plannedAt;
  delete template.expiresAt;
  delete template.qualificationAuthorityBundle;
  delete template.probeProviderResourceAuthorityBundle;
  refreshAgentEvaluationTestMaterialCatalogDigests(template);
  const materialized = createAgentEvaluationProductionRunConfigDocument(
    template,
    createAgentEvaluationTestQualificationAuthorityBundle(template),
    createAgentEvaluationTestProbeProviderResourceAuthorityBundle(template),
    '2026-08-08T00:00:00.000Z'
  );
  const mutable = source as Record<string, unknown>;
  for (const key of Object.keys(mutable)) delete mutable[key];
  Object.assign(mutable, structuredClone(materialized));
  return source;
};
