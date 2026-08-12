import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it, vi } from 'vitest';

import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import {
  PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_HEALTH_FORMAT,
  PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_ID,
  PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_IMPLEMENTATION_DIGEST,
  PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_MAXIMUM_FACTS,
  PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_MAXIMUM_REQUEST_BYTES,
  PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_MAXIMUM_RESPONSE_BYTES,
  PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_PURPOSE,
  PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_VERSION,
  type ProductionControlledWorkspaceOrphanRetirementAuthority,
} from './productionControlledWorkspaceDirectAuthority';
import type { ProductionControlledWorkspaceTransactionSessionAuthority } from './productionControlledWorkspaceSessionEngine';
import {
  createProductionAgentEvaluationWorkspaceVerificationOwnerAuthorityPortsFromEnvironmentAuthorities,
  createProductionAgentEvaluationWorkspaceVerificationOwnerAuthorityPortsFromEnvironment,
} from './productionOwnerAuthorityComposition';
import {
  PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_BASE_PATH,
  PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_ENVIRONMENT_NAMES,
  PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_IMPLEMENTATION_DIGEST,
  PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_PURPOSE,
} from './productionVerificationEvidenceDirectAuthority';
import { AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES } from './productionRunConfigArtifact';

const namespaceId = 'namespace.g4';
const repositoryCommit = 'a'.repeat(40);
const controlledToken = 'controlled-owner-ledger-token-0000000000000000';
const verificationToken = 'verification-owner-token-00000000000000000000';
const verificationBaseUrl = 'http://127.0.0.1:8080';

const environmentValues = Object.freeze({
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl]:
    AGENT_EVALUATION_LEDGER_BASE_URL,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace]: namespaceId,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit]:
    repositoryCommit,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token]: controlledToken,
  [PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_ENVIRONMENT_NAMES.baseUrl]:
    verificationBaseUrl,
  [PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_ENVIRONMENT_NAMES.token]:
    verificationToken,
});

const environment = (name: string): string | undefined =>
  environmentValues[name as keyof typeof environmentValues];

const clean = Object.freeze({
  status: 'clean' as const,
  residualResourceIds: Object.freeze([]) as readonly [],
  residualCanaryIds: Object.freeze([]) as readonly [],
});

const resources = () => {
  const closeSessions = vi.fn(async () => clean);
  const closeOrphans = vi.fn(async () => clean);
  const sessions: ProductionControlledWorkspaceTransactionSessionAuthority =
    Object.freeze({
      async loadOrReattach() {
        throw new Error('stateful session entry was not expected');
      },
      async restore() {
        throw new Error('stateful session restore was not expected');
      },
      close: closeSessions,
    });
  const orphanRetirement: ProductionControlledWorkspaceOrphanRetirementAuthority =
    Object.freeze({
      async execute() {
        throw new Error('orphan retirement was not expected');
      },
      async reconstruct() {
        throw new Error('orphan reconstruction was not expected');
      },
      close: closeOrphans,
    });
  return Object.freeze({
    sessions,
    orphanRetirement,
    closeSessions,
    closeOrphans,
  });
};

const jsonResponse = (
  value: unknown,
  contentType: 'application/json' | 'application/json; charset=utf-8'
): Response =>
  new Response(canonicalJsonText(value), {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': contentType,
    },
  });

const healthFetch = (
  verificationImplementationDigest = PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_IMPLEMENTATION_DIGEST
) =>
  vi.fn(async (source: string | URL | Request, init?: RequestInit) => {
    const url = String(source);
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toMatch(/^Bearer /u);
    if (url.endsWith('/controlled-workspace-owner/health')) {
      expect(headers.get('X-Prodivix-Controlled-Workspace-Owner-Purpose')).toBe(
        PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_PURPOSE
      );
      return jsonResponse(
        {
          format:
            PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_HEALTH_FORMAT,
          version: PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_VERSION,
          purpose: PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_PURPOSE,
          status: 'ready',
          authorityId: PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_ID,
          implementationDigest:
            PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_IMPLEMENTATION_DIGEST,
          maximumRequestBytes:
            PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_MAXIMUM_REQUEST_BYTES,
          maximumResponseBytes:
            PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_MAXIMUM_RESPONSE_BYTES,
          maximumFacts:
            PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_MAXIMUM_FACTS,
        },
        'application/json; charset=utf-8'
      );
    }
    expect(url).toBe(
      `${verificationBaseUrl}${PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_BASE_PATH}/health`
    );
    expect(headers.get('X-Prodivix-Verification-Authority-Purpose')).toBe(
      PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_PURPOSE
    );
    return jsonResponse(
      {
        format: 'prodivix.verification-agent-evaluation-owner-health',
        version: 1,
        purpose: PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_PURPOSE,
        implementationDigest: verificationImplementationDigest,
      },
      'application/json'
    );
  }) as typeof fetch;

describe('production owner authority composition', () => {
  it('joins the direct ledgers around one build-time Workspace session owner', async () => {
    const owned = resources();
    const fetch = healthFetch();
    const ports =
      await createProductionAgentEvaluationWorkspaceVerificationOwnerAuthorityPortsFromEnvironmentAuthorities(
        { environment, forbiddenCanaries: () => Object.freeze([]) },
        {
          controlledWorkspaceSessions: owned.sessions,
          orphanRetirement: owned.orphanRetirement,
          fetch,
        }
      );

    expect(ports.controlledWorkspace.authorityId).toBe(
      'evaluation.controlled-workspace.owner.v1'
    );
    expect(ports.verificationEvidence.authorityId).toBe(
      'evaluation.verification-evidence.owner.v1'
    );
    await expect(ports.close()).resolves.toEqual({
      status: 'clean',
      residualResourceIds: {
        controlledWorkspace: [],
        verificationEvidence: [],
      },
      residualCanaryIds: [],
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(owned.closeSessions).toHaveBeenCalledOnce();
    expect(owned.closeOrphans).toHaveBeenCalledOnce();
  });

  it('retires every acquired Workspace resource when Verification health drifts', async () => {
    const owned = resources();
    await expect(
      createProductionAgentEvaluationWorkspaceVerificationOwnerAuthorityPortsFromEnvironmentAuthorities(
        { environment, forbiddenCanaries: () => Object.freeze([]) },
        {
          controlledWorkspaceSessions: owned.sessions,
          orphanRetirement: owned.orphanRetirement,
          fetch: healthFetch(
            'sha256-0000000000000000000000000000000000000000000000000000000000000000'
          ),
        }
      )
    ).rejects.toThrow('health');
    expect(owned.closeSessions).toHaveBeenCalledOnce();
    expect(owned.closeOrphans).toHaveBeenCalledOnce();
  });

  it('keeps the concrete environment factory fail closed at the first missing G3 input', async () => {
    await expect(
      createProductionAgentEvaluationWorkspaceVerificationOwnerAuthorityPortsFromEnvironment(
        { environment, forbiddenCanaries: () => Object.freeze([]) }
      )
    ).rejects.toThrow(
      `G4_PRODUCTION_CONTROLLED_WORKSPACE_G3_ENVIRONMENT_INVALID: environment:${AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.path}`
    );
  });
});
