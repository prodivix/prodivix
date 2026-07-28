import { createBinaryAssetBlobReference } from '@prodivix/assets';
import {
  decodeVerificationEvidenceRetentionProtection,
  type VerificationEvidenceRetentionProtection,
} from '@prodivix/verification';
import { API_ROOT, apiRequest } from '@/infra/api';
import {
  decodeVerificationEvidenceVerifiedView,
  decodeVerificationEvidenceComparison,
  decodeVerificationEvidenceDetail,
  decodeVerificationEvidencePage,
  type VerificationEvidenceArtifactDescriptor,
  type VerificationEvidenceVerifiedView,
  type VerificationEvidenceComparison,
  type VerificationEvidencePage,
  type VerificationEvidenceTransportRecord,
  type VerificationEvidenceTrust,
} from './verificationEvidenceCodec';
import { exactKeys, fail, recordAt } from './verificationEvidenceCodec.shared';

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const VERIFICATION_INTENT_HEADER = 'X-Prodivix-Verification-Intent';

type ApiRequestPort = typeof apiRequest;
type FetchPort = typeof fetch;

export type VerificationEvidenceListInput = Readonly<{
  workspaceId: string;
  workspaceRevision: number;
  planDigest: string;
  cellId?: string;
  trust?: VerificationEvidenceTrust;
  outcome?:
    'passed' | 'failed' | 'blocked' | 'cancelled' | 'infrastructure-error';
  limit?: number;
  cursor?: string;
  signal?: AbortSignal;
}>;

export type VerificationEvidenceDownloadedArtifact = Readonly<{
  contents: Uint8Array;
  mediaType: string;
  fileName: string;
}>;

type VerificationEvidenceRetentionMutationBase = Readonly<{
  workspaceId: string;
  evidenceId: string;
  kind: 'change' | 'release';
  externalRef: string;
  operationId: string;
  signal?: AbortSignal;
}>;

type VerificationEvidenceProtectRetentionInput =
  VerificationEvidenceRetentionMutationBase & Readonly<{ action: 'protect' }>;

type VerificationEvidenceReleaseRetentionInput =
  VerificationEvidenceRetentionMutationBase &
    Readonly<{
      action: 'release';
      protectionId: string;
      expectedVersion: number;
    }>;

type VerificationEvidenceRetentionMutationInput =
  | VerificationEvidenceProtectRetentionInput
  | VerificationEvidenceReleaseRetentionInput;

export type VerificationEvidenceClient = Readonly<{
  listEvidence(
    input: VerificationEvidenceListInput
  ): Promise<VerificationEvidencePage>;
  getEvidence(input: {
    workspaceId: string;
    evidenceId: string;
    signal?: AbortSignal;
  }): Promise<VerificationEvidenceTransportRecord>;
  getVerifiedEvidenceView(input: {
    workspaceId: string;
    workspaceRevision: number;
    planDigest: string;
    cellId?: string;
    signal?: AbortSignal;
  }): Promise<VerificationEvidenceVerifiedView>;
  compareEvidence(input: {
    workspaceId: string;
    evidenceId: string;
    otherEvidenceId: string;
    signal?: AbortSignal;
  }): Promise<VerificationEvidenceComparison>;
  supersedeEvidence(input: {
    workspaceId: string;
    evidenceId: string;
    newEvidenceId: string;
    reason: string;
    operationId: string;
    signal?: AbortSignal;
  }): Promise<void>;
  updateRetention: {
    (
      input: VerificationEvidenceProtectRetentionInput
    ): Promise<VerificationEvidenceRetentionProtection>;
    (input: VerificationEvidenceReleaseRetentionInput): Promise<void>;
  };
  tombstoneEvidence(input: {
    workspaceId: string;
    evidenceId: string;
    reason: string;
    operationId: string;
    signal?: AbortSignal;
  }): Promise<void>;
  downloadArtifact(input: {
    workspaceId: string;
    evidenceId: string;
    artifact: VerificationEvidenceArtifactDescriptor;
    signal?: AbortSignal;
  }): Promise<VerificationEvidenceDownloadedArtifact>;
}>;

export type CreateVerificationEvidenceClientOptions = Readonly<{
  accessToken: string;
  request?: ApiRequestPort;
  fetch?: FetchPort;
}>;

const routeIdentifier = (value: string, name: string): string => {
  const normalized = value.trim();
  if (normalized !== value || !IDENTIFIER_PATTERN.test(normalized)) {
    throw new TypeError(`${name} must be a bounded Verification identifier.`);
  }
  return normalized;
};

const digest = (value: string, name: string): string => {
  const normalized = value.trim();
  if (!DIGEST_PATTERN.test(normalized)) {
    throw new TypeError(`${name} must be a SHA-256 digest.`);
  }
  return normalized;
};

const revision = (value: number): number => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError('workspaceRevision must be a positive safe integer.');
  }
  return value;
};

const boundedText = (
  value: string,
  name: string,
  maximumLength: number
): string => {
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > maximumLength ||
    normalized.normalize('NFC') !== normalized
  ) {
    throw new TypeError(`${name} must be bounded non-empty NFC text.`);
  }
  return normalized;
};

const mutationOperationId = (value: string): string => {
  const operationId = boundedText(value, 'operationId', 256);
  if (
    operationId.length < 16 ||
    operationId.includes(String.fromCodePoint(0)) ||
    operationId.includes('\r') ||
    operationId.includes('\n')
  ) {
    throw new TypeError(
      'operationId must be a stable bounded mutation identifier.'
    );
  }
  return operationId;
};

const pathForWorkspace = (workspaceId: string): string =>
  `/workspaces/${encodeURIComponent(routeIdentifier(workspaceId, 'workspaceId'))}/verification`;

const jsonOptions = (
  accessToken: string,
  intent: string,
  body: unknown,
  signal?: AbortSignal,
  idempotencyKey?: string
): RequestInit & { token: string } => ({
  method: 'POST',
  token: accessToken,
  headers: {
    'Content-Type': 'application/json',
    [VERIFICATION_INTENT_HEADER]: intent,
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
  },
  body: JSON.stringify(body),
  ...(signal ? { signal } : {}),
});

const optionalSignal = (
  accessToken: string,
  signal: AbortSignal | undefined
): RequestInit & { token: string } => ({
  token: accessToken,
  ...(signal ? { signal } : {}),
});

const contentType = (response: Response): string | undefined =>
  response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();

const headerIncludesToken = (
  response: Response,
  name: string,
  token: string
): boolean =>
  response.headers
    .get(name)
    ?.toLowerCase()
    .split(/[;,]/u)
    .map((value) => value.trim())
    .includes(token.toLowerCase()) ?? false;

const validateArtifactResponseHeaders = (
  response: Response,
  artifact: VerificationEvidenceArtifactDescriptor
): void => {
  const disposition = response.headers.get('content-disposition');
  const securityPolicy = response.headers
    .get('content-security-policy')
    ?.toLowerCase();
  const etag = response.headers.get('etag');
  const length = response.headers.get('content-length');
  if (
    contentType(response) !== artifact.mediaType ||
    !disposition ||
    !/^attachment(?:;|$)/iu.test(disposition) ||
    response.headers.get('x-content-type-options')?.toLowerCase() !==
      'nosniff' ||
    !securityPolicy?.includes('sandbox') ||
    !securityPolicy.includes("default-src 'none'") ||
    !headerIncludesToken(response, 'cache-control', 'private') ||
    !headerIncludesToken(response, 'cache-control', 'no-store') ||
    etag !== `"${artifact.digest}"` ||
    (length !== null &&
      (!/^\d+$/u.test(length) || Number(length) !== artifact.size))
  ) {
    throw new TypeError(
      'Verification artifact response did not preserve its attachment security contract.'
    );
  }
};

const decodeRetentionProtectionResponse = (
  value: unknown
): VerificationEvidenceRetentionProtection => {
  const envelope = recordAt(value, '/');
  exactKeys(envelope, '/', ['protection']);
  const decoded = decodeVerificationEvidenceRetentionProtection(
    envelope.protection
  );
  if (decoded.ok === true) return decoded.value;
  const issue = decoded.issues[0];
  return fail(
    issue?.path === '/' ? '/protection' : `/protection${issue?.path ?? ''}`,
    issue?.message ?? 'expected an active retention protection'
  );
};

/**
 * Authenticated Web adapter for the durable Evidence service. Every JSON
 * response is decoded before it can enter editor state; artifact bytes remain
 * attachment-only and are rehashed against their Evidence descriptor.
 */
export const createVerificationEvidenceClient = (
  options: CreateVerificationEvidenceClientOptions
): VerificationEvidenceClient => {
  const accessToken = options.accessToken.trim();
  if (!accessToken) {
    throw new TypeError(
      'Verification Evidence requires an authenticated session.'
    );
  }
  const request = options.request ?? apiRequest;
  const fetchPort = options.fetch ?? globalThis.fetch.bind(globalThis);

  async function updateRetention(
    input: VerificationEvidenceProtectRetentionInput
  ): Promise<VerificationEvidenceRetentionProtection>;
  async function updateRetention(
    input: VerificationEvidenceReleaseRetentionInput
  ): Promise<void>;
  async function updateRetention(
    input: VerificationEvidenceRetentionMutationInput
  ): Promise<VerificationEvidenceRetentionProtection | void> {
    const basePath = pathForWorkspace(input.workspaceId);
    const evidenceId = routeIdentifier(input.evidenceId, 'evidenceId');
    const externalRef = boundedText(input.externalRef, 'externalRef', 512);
    if (
      input.action === 'release' &&
      (!Number.isSafeInteger(input.expectedVersion) ||
        input.expectedVersion < 1)
    ) {
      throw new TypeError('expectedVersion must be a positive safe integer.');
    }
    const requestOptions = jsonOptions(
      accessToken,
      'retention',
      {
        action: input.action,
        kind: input.kind,
        externalRef,
        ...(input.action === 'release'
          ? {
              protectionId: routeIdentifier(input.protectionId, 'protectionId'),
            }
          : {}),
        ...(input.action === 'protect'
          ? { expectedEvidenceState: 'active' }
          : {}),
        expectedProtectionState:
          input.action === 'protect' ? 'absent' : 'active',
        ...(input.action === 'release'
          ? { expectedVersion: input.expectedVersion }
          : {}),
      },
      input.signal,
      mutationOperationId(input.operationId)
    );
    const route = `${basePath}/evidence/${encodeURIComponent(evidenceId)}/retention`;
    if (input.action === 'release') {
      await request<void>(route, requestOptions);
      return;
    }
    const protection = decodeRetentionProtectionResponse(
      await request<unknown>(route, requestOptions)
    );
    if (protection.evidenceId !== evidenceId) {
      throw new TypeError(
        'Verification retention response drifted from the requested Evidence identity.'
      );
    }
    return protection;
  }

  return Object.freeze({
    async listEvidence(input) {
      const basePath = pathForWorkspace(input.workspaceId);
      const query = new URLSearchParams();
      query.set('workspaceRevision', String(revision(input.workspaceRevision)));
      query.set('planDigest', digest(input.planDigest, 'planDigest'));
      if (input.cellId) {
        query.set('cellId', routeIdentifier(input.cellId, 'cellId'));
      }
      if (input.trust) query.set('trust', input.trust);
      if (input.outcome) query.set('outcome', input.outcome);
      const limit = input.limit ?? 100;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new TypeError('Evidence list limit must be between 1 and 100.');
      }
      query.set('limit', String(limit));
      if (input.cursor) {
        query.set('cursor', boundedText(input.cursor, 'cursor', 2048));
      }
      const response = await request<unknown>(
        `${basePath}/evidence?${query.toString()}`,
        optionalSignal(accessToken, input.signal)
      );
      return decodeVerificationEvidencePage(response);
    },

    async getEvidence(input) {
      const basePath = pathForWorkspace(input.workspaceId);
      const evidenceId = routeIdentifier(input.evidenceId, 'evidenceId');
      const response = await request<unknown>(
        `${basePath}/evidence/${encodeURIComponent(evidenceId)}`,
        optionalSignal(accessToken, input.signal)
      );
      return decodeVerificationEvidenceDetail(response);
    },

    async getVerifiedEvidenceView(input) {
      const basePath = pathForWorkspace(input.workspaceId);
      const query = new URLSearchParams();
      query.set('workspaceRevision', String(revision(input.workspaceRevision)));
      query.set('planDigest', digest(input.planDigest, 'planDigest'));
      if (input.cellId) {
        query.set('cellId', routeIdentifier(input.cellId, 'cellId'));
      }
      const response = await request<unknown>(
        `${basePath}/closure?${query.toString()}`,
        optionalSignal(accessToken, input.signal)
      );
      return decodeVerificationEvidenceVerifiedView(response);
    },

    async compareEvidence(input) {
      const basePath = pathForWorkspace(input.workspaceId);
      const evidenceId = routeIdentifier(input.evidenceId, 'evidenceId');
      const otherEvidenceId = routeIdentifier(
        input.otherEvidenceId,
        'otherEvidenceId'
      );
      const response = await request<unknown>(
        `${basePath}/evidence/${encodeURIComponent(evidenceId)}/compare`,
        jsonOptions(accessToken, 'compare', { otherEvidenceId }, input.signal)
      );
      const comparison = decodeVerificationEvidenceComparison(response);
      if (
        comparison.leftEvidenceId !== evidenceId ||
        comparison.rightEvidenceId !== otherEvidenceId
      ) {
        throw new TypeError(
          'Verification comparison response drifted from the requested Evidence identities.'
        );
      }
      return comparison;
    },

    async supersedeEvidence(input) {
      const basePath = pathForWorkspace(input.workspaceId);
      const evidenceId = routeIdentifier(input.evidenceId, 'evidenceId');
      const newEvidenceId = routeIdentifier(
        input.newEvidenceId,
        'newEvidenceId'
      );
      if (newEvidenceId === evidenceId) {
        throw new TypeError('Verification Evidence cannot supersede itself.');
      }
      await request<void>(
        `${basePath}/evidence/${encodeURIComponent(evidenceId)}/supersede`,
        jsonOptions(
          accessToken,
          'supersede',
          {
            newEvidenceId,
            reason: boundedText(input.reason, 'reason', 512),
            expectedOldEvidenceState: 'active',
            expectedNewEvidenceState: 'active',
            expectedSupersessionState: 'none',
          },
          input.signal,
          mutationOperationId(input.operationId)
        )
      );
    },

    updateRetention,

    async tombstoneEvidence(input) {
      const basePath = pathForWorkspace(input.workspaceId);
      const evidenceId = routeIdentifier(input.evidenceId, 'evidenceId');
      await request<void>(
        `${basePath}/evidence/${encodeURIComponent(evidenceId)}`,
        {
          ...jsonOptions(
            accessToken,
            'delete',
            {
              reason: boundedText(input.reason, 'reason', 512),
              expectedEvidenceState: 'active',
            },
            input.signal,
            mutationOperationId(input.operationId)
          ),
          method: 'DELETE',
        }
      );
    },

    async downloadArtifact(input) {
      const basePath = pathForWorkspace(input.workspaceId);
      const evidenceId = routeIdentifier(input.evidenceId, 'evidenceId');
      const artifactId = routeIdentifier(input.artifact.id, 'artifactId');
      if (input.artifact.availability !== 'available') {
        throw new TypeError(
          'Unavailable Verification artifacts cannot be downloaded.'
        );
      }
      const response = await fetchPort(
        `${API_ROOT}${basePath}/evidence/${encodeURIComponent(evidenceId)}/artifacts/${encodeURIComponent(artifactId)}/content`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` },
          ...(input.signal ? { signal: input.signal } : {}),
        }
      );
      if (!response.ok) {
        throw new Error(
          `Verification artifact download failed with status ${response.status}.`
        );
      }
      validateArtifactResponseHeaders(response, input.artifact);
      const contents = new Uint8Array(await response.arrayBuffer());
      const reference = createBinaryAssetBlobReference({
        contents,
        mediaType: input.artifact.mediaType,
      });
      if (
        reference.digest !== input.artifact.digest ||
        reference.byteLength !== input.artifact.size
      ) {
        throw new TypeError(
          'Verification artifact bytes drifted from their Evidence descriptor.'
        );
      }
      return Object.freeze({
        contents,
        mediaType: input.artifact.mediaType,
        fileName: artifactId,
      });
    },
  });
};
