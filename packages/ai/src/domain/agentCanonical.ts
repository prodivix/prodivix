import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import type {
  AgentWorkspaceDocumentRevision,
  AgentWorkspaceRevisionVector,
  CanonicalDigest,
} from './agent.types';

export const AGENT_CANONICAL_DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;

export const digestAgentCanonicalValue = (value: unknown): CanonicalDigest =>
  `sha256-${bytesToHex(sha256(utf8ToBytes(canonicalJsonText(value))))}`;

/** SHA-256 over the exact byte sequence, without a JSON/text projection. */
export const digestAgentCanonicalBytes = (value: Uint8Array): CanonicalDigest =>
  `sha256-${bytesToHex(sha256(value))}`;

export const isAgentCanonicalDigest = (
  value: unknown
): value is CanonicalDigest =>
  typeof value === 'string' && AGENT_CANONICAL_DIGEST_PATTERN.test(value);

export const isAgentWorkspaceRevisionVector = (
  value: unknown
): value is AgentWorkspaceRevisionVector => {
  if (
    !isPlainObject(value) ||
    !Number.isSafeInteger(value.workspaceRev) ||
    Number(value.workspaceRev) < 0 ||
    !Number.isSafeInteger(value.routeRev) ||
    Number(value.routeRev) < 0 ||
    !Number.isSafeInteger(value.opSeq) ||
    Number(value.opSeq) < 0 ||
    !Array.isArray(value.documents) ||
    value.documents.length > 50_000
  ) {
    return false;
  }
  const documentIds = new Set<string>();
  for (const document of value.documents) {
    if (
      !isPlainObject(document) ||
      typeof document.documentId !== 'string' ||
      !document.documentId.trim() ||
      documentIds.has(document.documentId) ||
      !Number.isSafeInteger(document.contentRev) ||
      Number(document.contentRev) < 0 ||
      !Number.isSafeInteger(document.metaRev) ||
      Number(document.metaRev) < 0
    ) {
      return false;
    }
    documentIds.add(document.documentId);
  }
  return true;
};

export const canonicalizeAgentWorkspaceRevision = (
  revision: AgentWorkspaceRevisionVector
): AgentWorkspaceRevisionVector => {
  if (!isAgentWorkspaceRevisionVector(revision)) {
    throw new TypeError('Agent Workspace revision vector is invalid.');
  }
  return Object.freeze({
    workspaceRev: revision.workspaceRev,
    routeRev: revision.routeRev,
    opSeq: revision.opSeq,
    documents: Object.freeze(
      [...revision.documents]
        .sort((left, right) =>
          compareUnicodeCodePoints(left.documentId, right.documentId)
        )
        .map((document): AgentWorkspaceDocumentRevision =>
          Object.freeze({ ...document })
        )
    ),
  });
};

export const sameAgentWorkspaceRevision = (
  left: AgentWorkspaceRevisionVector,
  right: AgentWorkspaceRevisionVector
): boolean =>
  isAgentWorkspaceRevisionVector(left) &&
  isAgentWorkspaceRevisionVector(right) &&
  canonicalJsonText(canonicalizeAgentWorkspaceRevision(left)) ===
    canonicalJsonText(canonicalizeAgentWorkspaceRevision(right));

export const compareAgentCanonicalText = compareUnicodeCodePoints;
