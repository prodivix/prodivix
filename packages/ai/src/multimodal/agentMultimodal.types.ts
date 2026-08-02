import type {
  BinaryAssetBlobReference,
  BinaryAssetScanAttestation,
  BinaryAssetTransformRecipe,
} from '@prodivix/assets';
import type {
  AgentContextAuthority,
  AgentContextItemId,
  AgentGroundingReference,
  AgentInvocationId,
  AgentJsonValue,
  AgentProviderProtocolFamily,
  AgentRunId,
  AgentSensitivity,
  AgentTargetRef,
  AgentTaskId,
  AgentTaskMode,
  AgentWorkspaceRevisionVector,
  CanonicalDigest,
  DecimalString,
  Instant,
} from '../domain/agent.types';
import type {
  AgentProviderDataPolicy,
  AgentUsageVector,
} from '../providers/agentProvider.types';

export type AgentModalityKind =
  | 'text'
  | 'code'
  | 'raster-image'
  | 'svg'
  | 'screenshot'
  | 'pdf'
  | 'document'
  | 'audio'
  | 'video'
  | 'accessibility-tree';

export type AgentMediaLimits = Readonly<{
  maxSourceBytes: number;
  maxFinalBytes: number;
  maxWidth?: number;
  maxHeight?: number;
  maxPixels?: number;
  maxPages?: number;
  maxDurationMs?: number;
  maxFrames?: number;
  maxTransforms: number;
  maxTransformElapsedMs: number;
  maxTransformMemoryBytes: number;
}>;

export type AgentModalityProfile = Readonly<{
  modalityProfileId: string;
  kind: AgentModalityKind;
  direction: 'input' | 'output';
  acceptedMediaTypes: readonly string[];
  transformPolicyDigest: CanonicalDigest;
  hardLimits: AgentMediaLimits;
  providerRepresentationDigest: CanonicalDigest;
  profileDigest: CanonicalDigest;
}>;

export type AgentScreenshotCaptureIdentity = Readonly<{
  workspaceRevision: AgentWorkspaceRevisionVector;
  rendererIdentityDigest: CanonicalDigest;
  browserIdentityDigest: CanonicalDigest;
  viewport: Readonly<{ width: number; height: number }>;
  devicePixelRatio: DecimalString;
  colorScheme: 'light' | 'dark';
  locale: string;
  fontSetDigest: CanonicalDigest;
  animationState: 'frozen' | 'running';
  reducedMotion: boolean;
  capturedAt: Instant;
  captureDigest: CanonicalDigest;
}>;

export type AgentMediaSourceDescriptor = Readonly<{
  mediaSourceId: string;
  kind: AgentModalityKind;
  authority: AgentContextAuthority;
  source: AgentGroundingReference;
  workspaceRevision?: AgentWorkspaceRevisionVector;
  contentDigest: CanonicalDigest;
  mediaType: string;
  byteLength: number;
  dimensions?: Readonly<{ width: number; height: number }>;
  pageCount?: number;
  durationMs?: number;
  frameRate?: DecimalString;
  sampleRate?: number;
  channelCount?: number;
  sensitivity: AgentSensitivity;
  sourceTraceRef?: string;
  provenanceRef?: string;
  screenshotCapture?: AgentScreenshotCaptureIdentity;
  descriptorDigest: CanonicalDigest;
}>;

export type AgentMediaOmission = Readonly<{
  kind: 'page-range' | 'pixel-region' | 'frame-range' | 'time-range';
  start: number;
  end: number;
  reason: 'budget' | 'policy' | 'redacted' | 'selection' | 'unsupported';
  omissionDigest: CanonicalDigest;
}>;

export type AgentMediaTransformationOperation =
  | 'decode'
  | 'resize'
  | 'crop'
  | 'color-convert'
  | 'rasterize'
  | 'page-select'
  | 'ocr'
  | 'transcribe'
  | 'frame-sample'
  | 'compress'
  | 'redact';

export type AgentMediaTransformationReceipt = Readonly<{
  transformationId: string;
  transformerId: string;
  transformerVersion: string;
  transformerDigest: CanonicalDigest;
  operation: AgentMediaTransformationOperation;
  parametersDigest: CanonicalDigest;
  inputDigest: CanonicalDigest;
  outputDigest: CanonicalDigest;
  outputMediaType: string;
  outputByteLength: number;
  loss: 'none' | 'bounded-lossy' | 'unknown';
  omittedRegions: readonly AgentMediaOmission[];
  diagnosticRefs: readonly string[];
  elapsedMs: number;
  peakMemoryBytes: number;
  receiptDigest: CanonicalDigest;
}>;

export type AgentMediaRepresentation = Readonly<{
  sourceDescriptorRef: Readonly<{
    mediaSourceId: string;
    descriptorDigest: CanonicalDigest;
  }>;
  transformationReceiptRefs: readonly Readonly<{
    transformationId: string;
    receiptDigest: CanonicalDigest;
  }>[];
  finalContentDigest: CanonicalDigest;
  finalMediaType: string;
  finalByteLength: number;
  providerBlockDigest: CanonicalDigest;
  completeness: 'complete' | 'partial';
  representationDigest: CanonicalDigest;
}>;

export type AgentMediaExtractedSignalKind =
  | 'ocr'
  | 'pdf-layer'
  | 'qr'
  | 'metadata'
  | 'caption'
  | 'transcript'
  | 'tool-media-result';

export type AgentMediaExtractedSignal = Readonly<{
  kind: AgentMediaExtractedSignalKind;
  text: string;
  contentDigest: CanonicalDigest;
  instructionBoundary: 'data-only';
}>;

export type AgentMediaSafetyVerdict =
  'clean' | 'quarantined' | 'corrupt' | 'oversized' | 'bomb' | 'unsupported';

export type AgentMediaSafetyReceipt = Readonly<{
  scannerId: string;
  scannerVersion: string;
  scannerDigest: CanonicalDigest;
  subjectDigest: CanonicalDigest;
  verdict: AgentMediaSafetyVerdict;
  findingCodes: readonly string[];
  extractedSignals: readonly AgentMediaExtractedSignal[];
  receiptDigest: CanonicalDigest;
}>;

export type AgentMediaTransformerDescriptor = Readonly<{
  transformerId: string;
  transformerVersion: string;
  implementationDigest: CanonicalDigest;
  operations: readonly AgentMediaTransformationOperation[];
  inputMediaTypes: readonly string[];
  outputMediaTypes: readonly string[];
  deterministic: true;
  descriptorDigest: CanonicalDigest;
}>;

export type AgentMediaTransformOutput = Readonly<{
  contents: Uint8Array;
  mediaType: string;
  loss: AgentMediaTransformationReceipt['loss'];
  omissions?: readonly Omit<AgentMediaOmission, 'omissionDigest'>[];
  extractedSignals?: readonly Readonly<{
    kind: AgentMediaExtractedSignalKind;
    text: string;
  }>[];
  elapsedMs: number;
  peakMemoryBytes: number;
}>;

export interface AgentMediaTransformer {
  readonly descriptor: AgentMediaTransformerDescriptor;
  transform(
    input: Readonly<{
      operation: AgentMediaTransformationOperation;
      parameters: AgentJsonValue;
      source: AgentMediaSourceDescriptor;
      inputDigest: CanonicalDigest;
      inputMediaType: string;
      contents: Uint8Array;
    }>
  ): Promise<AgentMediaTransformOutput>;
}

export type AgentMediaSafetyScannerDescriptor = Readonly<{
  scannerId: string;
  scannerVersion: string;
  implementationDigest: CanonicalDigest;
  supportedMediaTypes: readonly string[];
  descriptorDigest: CanonicalDigest;
}>;

export interface AgentMediaSafetyScanner {
  readonly descriptor: AgentMediaSafetyScannerDescriptor;
  scan(
    input: Readonly<{
      source: AgentMediaSourceDescriptor;
      subjectDigest: CanonicalDigest;
      mediaType: string;
      contents: Uint8Array;
      phase: 'source' | 'representation';
    }>
  ): Promise<
    Readonly<{
      verdict: AgentMediaSafetyVerdict;
      findingCodes: readonly string[];
      extractedSignals?: readonly Readonly<{
        kind: AgentMediaExtractedSignalKind;
        text: string;
      }>[];
    }>
  >;
}

export type AgentMediaTransformStep = Readonly<{
  operation: AgentMediaTransformationOperation;
  parameters: AgentJsonValue;
  transformer: AgentMediaTransformer;
}>;

export type AgentMediaTransformIssue = Readonly<{
  code: 'AI-6002' | 'AI-7002' | 'AI-7010' | 'AI-9001';
  path: string;
  message: string;
  blocking: true;
}>;

export type AgentMediaTransformResult =
  | Readonly<{
      status: 'ready';
      representation: AgentMediaRepresentation;
      transformationReceipts: readonly AgentMediaTransformationReceipt[];
      safetyReceipts: readonly AgentMediaSafetyReceipt[];
      extractedSignals: readonly AgentMediaExtractedSignal[];
      contents: Uint8Array;
      usage: AgentUsageVector;
    }>
  | Readonly<{
      status: 'blocked';
      issues: readonly AgentMediaTransformIssue[];
      safetyReceipts: readonly AgentMediaSafetyReceipt[];
    }>;

export type AgentMultimodalContextItem = Readonly<{
  itemId: AgentContextItemId;
  modalityProfileRef: Readonly<{
    modalityProfileId: string;
    profileDigest: CanonicalDigest;
  }>;
  authority: AgentContextAuthority;
  mediaRepresentationRef: Readonly<{
    representationDigest: CanonicalDigest;
  }>;
  contentDigest: CanonicalDigest;
  sensitivity: AgentSensitivity;
  instructionBoundary: 'user-intent' | 'data-only';
  sourceTraceRef?: string;
  omissionRefs: readonly Readonly<{
    omissionDigest: CanonicalDigest;
  }>[];
  itemDigest: CanonicalDigest;
}>;

export type AgentProviderMediaBlockKind =
  'input-image' | 'input-document' | 'input-audio' | 'input-video';

export type AgentProviderMediaBlock = Readonly<{
  blockId: string;
  protocolFamily: Exclude<AgentProviderProtocolFamily, 'openai-compatible'>;
  providerBlockType:
    'input_image' | 'input_file' | 'image' | 'document' | 'inline_data';
  kind: AgentProviderMediaBlockKind;
  representationDigest: CanonicalDigest;
  contentDigest: CanonicalDigest;
  mediaType: string;
  byteLength: number;
  payloadAuthority: 'callback-bound-bytes';
  instructionBoundary: 'data-only';
  blockDigest: CanonicalDigest;
}>;

export type AgentProviderMediaBlockManifest = Readonly<{
  protocolFamily: AgentProviderMediaBlock['protocolFamily'];
  blocks: readonly AgentProviderMediaBlock[];
  dataPolicyDigest: CanonicalDigest;
  manifestDigest: CanonicalDigest;
}>;

export type AgentMultimodalContextManifest = Readonly<{
  taskId: AgentTaskId;
  runId: AgentRunId;
  generation: number;
  taskMode: AgentTaskMode;
  workspaceRevision: AgentWorkspaceRevisionVector;
  baseContextPackDigest: CanonicalDigest;
  items: readonly AgentMultimodalContextItem[];
  representations: readonly AgentMediaRepresentation[];
  providerBlockManifest: AgentProviderMediaBlockManifest;
  usage: AgentUsageVector;
  manifestDigest: CanonicalDigest;
}>;

export type AgentVisualObservation = Readonly<{
  observationId: string;
  representationDigest: CanonicalDigest;
  workspaceRevision: AgentWorkspaceRevisionVector;
  sourceTraceRef?: string;
  label?: string;
  coordinates?: Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  observationDigest: CanonicalDigest;
}>;

export type AgentVisualTargetResolution =
  | Readonly<{
      status: 'resolved';
      observationDigest: CanonicalDigest;
      target: AgentTargetRef;
      sourceTraceRef: string;
      resolutionDigest: CanonicalDigest;
    }>
  | Readonly<{
      status: 'unresolved';
      observationDigest: CanonicalDigest;
      reason: 'missing-source-trace' | 'no-typed-target' | 'revision-drift';
      resolutionDigest: CanonicalDigest;
    }>;

export interface AgentVisualTargetResolver {
  resolve(
    input: Readonly<{
      observation: AgentVisualObservation;
      workspaceRevision: AgentWorkspaceRevisionVector;
    }>
  ): Readonly<{ target: AgentTargetRef; sourceTraceRef: string }> | undefined;
}

export type AgentProviderArtifactRef = Readonly<{
  providerArtifactId: string;
  providerConfigurationId: string;
  artifactIdentityDigest: CanonicalDigest;
  expiresAt: Instant;
}>;

export type AgentUntrustedProvenanceClaim = Readonly<{
  kind: 'license' | 'originality' | 'safety' | 'identity';
  claim: string;
  confidence: 'provider-claimed' | 'unknown';
  claimDigest: CanonicalDigest;
}>;

export type AgentGeneratedArtifactCandidate = Readonly<{
  candidateId: string;
  taskId: AgentTaskId;
  runId: AgentRunId;
  generation: number;
  producingInvocationId: AgentInvocationId;
  capabilityQualificationDigest: CanonicalDigest;
  inputRepresentationDigests: readonly CanonicalDigest[];
  promptPolicyDigest: CanonicalDigest;
  providerArtifactRef: AgentProviderArtifactRef;
  declaredMediaType?: string;
  declaredByteLength?: number;
  providerSafetyReceiptRef?: string;
  provenanceClaims: readonly AgentUntrustedProvenanceClaim[];
  candidateDigest: CanonicalDigest;
}>;

export interface AgentProviderArtifactResolver {
  resolve(
    input: Readonly<{
      candidate: AgentGeneratedArtifactCandidate;
      taskId: AgentTaskId;
      runId: AgentRunId;
      generation: number;
      invocationId: AgentInvocationId;
    }>
  ): Promise<Readonly<{ contents: Uint8Array; mediaType: string }>>;
}

export type AgentGeneratedAssetProvenance = Readonly<{
  candidateDigest: CanonicalDigest;
  providerArtifactIdentityDigest: CanonicalDigest;
  capabilityQualificationDigest: CanonicalDigest;
  inputRepresentationDigests: readonly CanonicalDigest[];
  promptPolicyDigest: CanonicalDigest;
  sourceDigest: CanonicalDigest;
  sanitizedDigest: CanonicalDigest;
  transformRecipeDigest: CanonicalDigest;
  scannerAttestationDigest: CanonicalDigest;
  licenseDisposition: 'unknown';
  provenanceDigest: CanonicalDigest;
}>;

export type AgentGeneratedAssetProposal = Readonly<{
  proposalId: string;
  proposalKind: 'asset-create';
  candidateId: string;
  taskId: AgentTaskId;
  runId: AgentRunId;
  generation: number;
  assetDocumentId: string;
  finalReference: BinaryAssetBlobReference;
  transformRecipe: BinaryAssetTransformRecipe;
  scanAttestation: BinaryAssetScanAttestation;
  provenance: AgentGeneratedAssetProvenance;
  requiredApproval: 'exact-human';
  commitAuthority: 'none-before-approval';
  proposalDigest: CanonicalDigest;
}>;

export type AgentGeneratedArtifactAdoptionIssue = Readonly<{
  code: 'AI-6002' | 'AI-7011' | 'AI-9001';
  path: string;
  message: string;
  blocking: true;
}>;

export type AgentGeneratedArtifactAdoptionResult =
  | Readonly<{
      status: 'proposed';
      proposal: AgentGeneratedAssetProposal;
      usage: AgentUsageVector;
    }>
  | Readonly<{
      status: 'blocked';
      issues: readonly AgentGeneratedArtifactAdoptionIssue[];
    }>;

export type AgentRealtimeMediaSession = Readonly<{
  sessionId: string;
  taskId: AgentTaskId;
  runId: AgentRunId;
  generation: number;
  transportGeneration: number;
  capabilityQualificationDigest: CanonicalDigest;
  mediaPolicyDigest: CanonicalDigest;
  deviceGrantDigest: CanonicalDigest;
  deviceKinds: readonly ('microphone' | 'camera')[];
  authorizationRef: string;
  startedAt: Instant;
  authorizationExpiresAt: Instant;
  maxDurationMs: number;
  maxCost: Readonly<{ currency: string; maximum: DecimalString }>;
  state: 'active' | 'fenced' | 'terminal';
  sessionDigest: CanonicalDigest;
}>;

export type AgentRealtimeTurn = Readonly<{
  turnId: string;
  sessionId: string;
  transportGeneration: number;
  state: 'partial' | 'final' | 'interrupted';
  contentDigest: CanonicalDigest;
  instructionBoundary: 'data-only';
  proposalAuthority: 'none';
  turnDigest: CanonicalDigest;
}>;

export type AgentMultimodalContextBuildRequest = Readonly<{
  taskId: AgentTaskId;
  runId: AgentRunId;
  generation: number;
  taskMode: AgentTaskMode;
  workspaceRevision: AgentWorkspaceRevisionVector;
  baseContextPackDigest: CanonicalDigest;
  protocolFamily: AgentProviderMediaBlock['protocolFamily'];
  providerDataPolicy: AgentProviderDataPolicy;
  media: readonly Readonly<{
    profile: AgentModalityProfile;
    source: AgentMediaSourceDescriptor;
    contents: Uint8Array;
    steps: readonly AgentMediaTransformStep[];
    scanner: AgentMediaSafetyScanner;
  }>[];
}>;

export type AgentMultimodalContextBuildResult =
  | Readonly<{
      status: 'ready';
      manifest: AgentMultimodalContextManifest;
      ephemeralPayloads: readonly Readonly<{
        blockId: string;
        contents: Uint8Array;
      }>[];
      transformationReceipts: readonly AgentMediaTransformationReceipt[];
      safetyReceipts: readonly AgentMediaSafetyReceipt[];
    }>
  | Readonly<{
      status: 'blocked';
      issues: readonly AgentMediaTransformIssue[];
      safetyReceipts: readonly AgentMediaSafetyReceipt[];
    }>;
