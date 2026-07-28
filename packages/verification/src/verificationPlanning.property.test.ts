import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createVerificationImpactSet,
  evaluateVerificationPolicy,
  serializeVerificationValue,
  type VerificationImpactContribution,
  type VerificationPolicy,
} from './index';

const parameters = Object.freeze({
  numRuns: 40,
  seed: 0x28_07_2026,
});

describe('Verification V4 canonical properties', () => {
  it('keeps ImpactSet bytes stable across contributor and member insertion order', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/), {
          minLength: 1,
          maxLength: 8,
        }),
        fc.boolean(),
        (ids, conservative) => {
          const contributions: VerificationImpactContribution[] = ids.map(
            (id, index) => ({
              contributorId: `contributor:${id}`,
              completeness:
                conservative && index === 0 ? 'conservative' : 'complete',
              changedDocumentIds: [`document:${id}`],
              changedSymbolIds: [`symbol:${id}`],
              impactedScenarioIds: [`scenario:${id}`],
              impactedDomains: [`domain:${id}`],
              frameworkTargets: ['vue-vite', 'react-vite'],
              runtimeZones: ['server', 'browser'],
              capabilityIds: [`capability:${id}`],
              reasons: [
                {
                  id: `reason:${id}`,
                  kind: 'symbol-change',
                  message: `${id} changed`,
                  contributorId: `contributor:${id}`,
                },
              ],
            })
          );
          const create = (values: readonly VerificationImpactContribution[]) =>
            createVerificationImpactSet({
              workspaceId: 'workspace:property',
              baseRevision: 1,
              basePartitionRevisions: {
                workspaceRev: 1,
                routeRev: 1,
                opSeq: 1,
                documentRevisions: {},
              },
              targetRevision: 2,
              targetPartitionRevisions: {
                workspaceRev: 2,
                routeRev: 1,
                opSeq: 2,
                documentRevisions: {},
              },
              semanticSchemaDigest: 'semantic:v1',
              providerSetDigest: 'sha256-providers',
              operationIds: ['operation:2', 'operation:1'],
              contributions: values,
              conservativeScope: {
                scenarioIds: ['scenario:all'],
                domains: ['project'],
                frameworkTargets: ['react-vite', 'vue-vite'],
                runtimeZones: ['browser', 'server'],
                capabilityIds: ['verification:project'],
                riskFlags: ['unknown-impact'],
              },
            });
          const forward = create(contributions);
          const reversed = create([...contributions].reverse());
          expect(reversed.status).toBe('ready');
          expect(forward.status).toBe('ready');
          if (forward.status !== 'ready' || reversed.status !== 'ready') {
            return;
          }
          expect(serializeVerificationValue(reversed.impactSet)).toBe(
            serializeVerificationValue(forward.impactSet)
          );
        }
      ),
      parameters
    );
  });

  it('makes forbidden precedence independent of Policy array order', () => {
    const controlProfileRef = {
      kind: 'workspace' as const,
      documentId: 'control:property',
    };
    const policy: VerificationPolicy = {
      id: 'policy:property',
      name: 'Property policy',
      defaultRequirement: 'advisory',
      rules: [
        {
          id: 'rule:required',
          requirement: 'required',
          checkKinds: ['security'],
          scenarioIds: [],
          scenarioTags: [],
          criticalities: [],
          impactedDomains: [],
          riskFlags: ['secret'],
          matrixProfileId: 'matrix:one',
          retryPolicyId: 'retry:one',
          evidenceTrust: 'ci-attested',
          controlProfileRef,
        },
        {
          id: 'rule:forbidden',
          requirement: 'forbidden',
          checkKinds: ['security'],
          scenarioIds: [],
          scenarioTags: [],
          criticalities: [],
          impactedDomains: [],
          riskFlags: ['secret'],
          matrixProfileId: 'matrix:one',
          retryPolicyId: 'retry:one',
          evidenceTrust: 'ci-attested',
          controlProfileRef,
        },
      ],
      matrixProfiles: [
        {
          id: 'matrix:one',
          name: 'One',
          matrix: {
            frameworkTargets: ['react-vite'],
            surfaces: ['ci'],
            browserEngines: ['chromium'],
            viewports: [{ id: 'desktop', width: 1280, height: 720 }],
            colorSchemes: ['light'],
            motions: ['reduced'],
            locales: ['en'],
          },
        },
      ],
      budgets: {
        maximumCells: 1,
        maximumCellsPerCheckKind: 1,
        maximumTargetExpansions: 1,
        maximumBrowserExpansions: 1,
        totalMs: 1,
        artifactBytes: 1,
        estimatedComputeUnits: 1,
        parallelism: 1,
      },
      retryPolicies: [
        {
          id: 'retry:one',
          maximumAttempts: 1,
          retryableOutcomes: ['infrastructure-error'],
          stabilitySamples: 1,
          freshFixtureNamespace: true,
        },
      ],
      exemptions: [],
      evidenceRequirements: {
        acceptedTrust: ['ci-attested'],
        maximumAgeMs: 1,
        requireAttestation: true,
        requireCompatibleIdentity: true,
        requiredArtifactKinds: [],
      },
      baselinePolicy: {
        visual: 'forbidden',
        requireCompatibleIdentity: true,
      },
      retentionRequest: {
        successful: 'session',
        failed: 'change',
        protectReleaseEvidence: false,
      },
    };
    fc.assert(
      fc.property(
        fc.shuffledSubarray([...policy.rules], {
          minLength: policy.rules.length,
          maxLength: policy.rules.length,
        }),
        (rules) => {
          const result = evaluateVerificationPolicy(
            { ...policy, rules },
            {
              checkId: 'check:security',
              checkKind: 'security',
              scenarioTags: [],
              impactedDomains: [],
              riskFlags: ['secret'],
              targetId: 'workspace',
            },
            '2026-07-28T00:00:00.000Z'
          );
          expect(result).toMatchObject({
            status: 'resolved',
            evaluation: {
              requirement: 'forbidden',
              trace: { forbiddenRuleIds: ['rule:forbidden'] },
            },
          });
        }
      ),
      parameters
    );
  });
});
