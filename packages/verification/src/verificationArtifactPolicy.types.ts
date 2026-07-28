import type {
  VerificationArtifactKind,
  VerificationEvidenceTargetPolicy,
} from './verification.types';

export type VerificationArtifactPolicy = Readonly<{
  maximumArtifacts: number;
  maximumSingleArtifactBytes: number;
  maximumTotalArtifactBytes: number;
  maximumPathBytes: number;
  maximumPathSegments: number;
  maximumJsonBytes: number;
  maximumTextBytes: number;
  maximumJsonDepth: number;
  maximumJsonNodes: number;
  maximumJsonStringBytes: number;
  maximumImageWidth: number;
  maximumImageHeight: number;
  maximumImagePixels: number;
  maximumImageStructuralEntries: number;
  maximumDiagnostics: number;
}>;

export type VerificationArtifactPolicyCandidate = Readonly<{
  id: string;
  path: string;
  kind: VerificationArtifactKind;
  digest: string;
  size: number;
  mediaType: string;
  sourceTraceDigest?: string;
  contents: Uint8Array;
}>;

export type VerificationArtifactTargetPolicy = VerificationEvidenceTargetPolicy;

export type VerificationArtifactDetectedMediaType =
  | 'application/gzip'
  | 'application/javascript'
  | 'application/json'
  | 'application/octet-stream'
  | 'application/pdf'
  | 'application/wasm'
  | 'application/x-archive'
  | 'application/zip'
  | 'application/xml'
  | 'image/jpeg'
  | 'image/png'
  | 'image/svg+xml'
  | 'text/html'
  | 'text/plain';

export type VerificationArtifactPolicyDiagnosticReason =
  | 'active-content'
  | 'archive'
  | 'authorization'
  | 'budget-exceeded'
  | 'cookie'
  | 'credential'
  | 'digest-mismatch'
  | 'duplicate-id'
  | 'duplicate-path'
  | 'environment-secret'
  | 'invalid-candidate'
  | 'invalid-image'
  | 'invalid-json'
  | 'invalid-path'
  | 'invalid-text'
  | 'media-mismatch'
  | 'pii'
  | 'secret-canary'
  | 'sensitive-target'
  | 'size-mismatch'
  | 'unsupported-media';

export type VerificationArtifactPolicyDiagnostic = Readonly<{
  code: 'VER-5001' | 'VER-5002' | 'VER-5005';
  reason: VerificationArtifactPolicyDiagnosticReason;
  artifactIndex: number;
}>;

export type VerificationArtifactPolicyAcceptedArtifact = Readonly<{
  descriptor: Readonly<Omit<VerificationArtifactPolicyCandidate, 'contents'>>;
  contents: Uint8Array;
  detectedMediaType: VerificationArtifactDetectedMediaType;
  imageMetadata?: Readonly<{ width: number; height: number }>;
}>;

export type VerificationArtifactPolicyDecision =
  | Readonly<{
      status: 'accepted';
      artifacts: readonly VerificationArtifactPolicyAcceptedArtifact[];
      totalBytes: number;
    }>
  | Readonly<{
      status: 'rejected';
      diagnostics: readonly VerificationArtifactPolicyDiagnostic[];
    }>;

export type VerificationArtifactPromotionInput = Readonly<{
  artifacts: readonly unknown[];
  policy?: VerificationArtifactPolicy;
  secretCanaries?: readonly string[];
  targetPolicy?: VerificationArtifactTargetPolicy;
}>;
