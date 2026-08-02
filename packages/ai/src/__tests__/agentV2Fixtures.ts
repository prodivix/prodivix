import {
  createBinaryAssetPngStructuralScanner,
  createBinaryAssetScannerChain,
  type BinaryAssetContentScanner,
} from '@prodivix/assets';
import {
  createAgentMediaSafetyScannerDescriptor,
  createAgentMediaTransformerDescriptor,
  createAgentProviderDataPolicy,
  createAgentScreenshotCaptureIdentity,
  createRequiredAgentModalityProfiles,
  digestAgentCanonicalValue,
  materializeAgentMediaSourceDescriptor,
  type AgentMediaSafetyScanner,
  type AgentMediaSourceDescriptor,
  type AgentMediaTransformer,
  type AgentScreenshotCaptureIdentity,
  type AgentWorkspaceRevisionVector,
} from '../index';
import {
  createScriptedAgentMediaSafetyScanner,
  createScriptedAgentMediaTransformer,
} from '../multimodal/agentMediaTransform';

export const V2_TEST_REVISION: AgentWorkspaceRevisionVector = Object.freeze({
  workspaceRev: 12,
  routeRev: 3,
  opSeq: 44,
  documents: Object.freeze([
    Object.freeze({
      documentId: 'page.catalog',
      contentRev: 7,
      metaRev: 2,
    }),
  ]),
});

export const V2_PNG = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0,
  0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120,
  156, 99, 224, 81, 178, 248, 15, 0, 2, 10, 1, 102, 120, 104, 41, 51, 0, 0, 0,
  0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

export const V2_PDF = new TextEncoder().encode(
  '%PDF-1.7\n1 0 obj <</Type /Catalog>> endobj\n%%EOF\n'
);

export const V2_DATA_POLICY = createAgentProviderDataPolicy({
  region: 'us-east-1',
  maximumSensitivity: 'internal',
  training: 'disabled',
  telemetry: 'disabled',
  retentionDays: 0,
  deletionReceipt: 'available',
  ambientMemory: 'disabled',
  storage: 'disabled',
  cacheIsolation: 'task',
});

export const createV2ScreenshotCapture = (): AgentScreenshotCaptureIdentity =>
  createAgentScreenshotCaptureIdentity({
    workspaceRevision: V2_TEST_REVISION,
    rendererIdentityDigest: digestAgentCanonicalValue('renderer.react.g4-v2'),
    browserIdentityDigest: digestAgentCanonicalValue('chromium.g4-v2'),
    viewport: Object.freeze({ width: 1280, height: 720 }),
    devicePixelRatio: '2',
    colorScheme: 'light',
    locale: 'zh-CN',
    fontSetDigest: digestAgentCanonicalValue('fonts.g4-v2'),
    animationState: 'frozen',
    reducedMotion: true,
    capturedAt: '2026-08-01T01:00:00.000Z',
  });

export const createV2ScreenshotSource = (
  contents = V2_PNG
): AgentMediaSourceDescriptor =>
  materializeAgentMediaSourceDescriptor({
    contents,
    mediaSourceId: 'media.catalog.screenshot',
    kind: 'screenshot',
    authority: 'derived',
    source: Object.freeze({
      kind: 'source-trace',
      id: 'trace.catalog.screenshot',
    }),
    workspaceRevision: V2_TEST_REVISION,
    mediaType: 'image/png',
    dimensions: Object.freeze({ width: 1, height: 1 }),
    sensitivity: 'internal',
    sourceTraceRef: 'trace.catalog.screenshot',
    screenshotCapture: createV2ScreenshotCapture(),
  });

export const createV2PdfSource = (
  contents = V2_PDF
): AgentMediaSourceDescriptor =>
  materializeAgentMediaSourceDescriptor({
    contents,
    mediaSourceId: 'media.catalog.specification',
    kind: 'pdf',
    authority: 'canonical',
    source: Object.freeze({
      kind: 'workspace-document',
      id: 'asset.catalog.specification',
    }),
    workspaceRevision: V2_TEST_REVISION,
    mediaType: 'application/pdf',
    pageCount: 2,
    sensitivity: 'internal',
    sourceTraceRef: 'trace.catalog.pdf',
    provenanceRef: 'asset-provenance.catalog.pdf',
  });

export const createV2CleanPngScanner = (): AgentMediaSafetyScanner => {
  const structural = createBinaryAssetPngStructuralScanner();
  const adapter = createScriptedAgentMediaSafetyScanner({
    descriptor: createAgentMediaSafetyScannerDescriptor({
      scannerId: 'test.g4-v2.png-structural',
      scannerVersion: '1',
      implementationDigest: digestAgentCanonicalValue(structural.descriptor),
      supportedMediaTypes: ['image/png'],
    }),
    async scan(request) {
      const result = await structural.scan({
        reference: {
          kind: 'workspace-blob',
          digest: request.subjectDigest,
          byteLength: request.contents.byteLength,
          mediaType: request.mediaType,
        },
        contents: request.contents,
      });
      return Object.freeze({
        verdict:
          result.verdict === 'clean'
            ? ('clean' as const)
            : ('quarantined' as const),
        findingCodes: result.findingCodes,
      });
    },
  });
  return adapter;
};

export const createV2DocumentScanner = (
  input: Readonly<{
    verdict?:
      | 'clean'
      | 'quarantined'
      | 'corrupt'
      | 'oversized'
      | 'bomb'
      | 'unsupported';
    signal?: string;
  }> = {}
): AgentMediaSafetyScanner =>
  createScriptedAgentMediaSafetyScanner({
    descriptor: createAgentMediaSafetyScannerDescriptor({
      scannerId: 'test.g4-v2.document-safety',
      scannerVersion: '1',
      implementationDigest: digestAgentCanonicalValue('document-safety-v1'),
      supportedMediaTypes: ['application/pdf'],
    }),
    scan() {
      return Object.freeze({
        verdict: input.verdict ?? ('clean' as const),
        findingCodes: Object.freeze(
          input.verdict && input.verdict !== 'clean'
            ? [`document-${input.verdict}`]
            : []
        ),
        ...(input.signal
          ? {
              extractedSignals: Object.freeze([
                Object.freeze({
                  kind: 'pdf-layer' as const,
                  text: input.signal,
                }),
              ]),
            }
          : {}),
      });
    },
  });

export const createV2PdfTransformer = (
  input: Readonly<{
    omission?: boolean;
    signal?: string;
  }> = {}
): AgentMediaTransformer =>
  createScriptedAgentMediaTransformer({
    descriptor: createAgentMediaTransformerDescriptor({
      transformerId: 'test.g4-v2.pdf-page-ocr',
      transformerVersion: '1',
      implementationDigest: digestAgentCanonicalValue('pdf-page-ocr-v1'),
      operations: ['page-select'],
      inputMediaTypes: ['application/pdf'],
      outputMediaTypes: ['application/pdf'],
      deterministic: true,
    }),
    transform(request) {
      return Object.freeze({
        contents: new Uint8Array(request.contents),
        mediaType: 'application/pdf',
        loss: input.omission ? ('bounded-lossy' as const) : ('none' as const),
        ...(input.omission
          ? {
              omissions: Object.freeze([
                Object.freeze({
                  kind: 'page-range' as const,
                  start: 1,
                  end: 2,
                  reason: 'selection' as const,
                }),
              ]),
            }
          : {}),
        extractedSignals: Object.freeze([
          Object.freeze({
            kind: 'ocr' as const,
            text: input.signal ?? 'Catalog product specification page.',
          }),
        ]),
        elapsedMs: 2,
        peakMemoryBytes: request.contents.byteLength * 2,
      });
    },
  });

export const createV2RequiredProfiles = createRequiredAgentModalityProfiles;

export const createV2G2ScannerChain = (): BinaryAssetContentScanner => {
  const structural = createBinaryAssetPngStructuralScanner();
  const malware: BinaryAssetContentScanner = Object.freeze({
    descriptor: Object.freeze({
      id: 'test.g4-v2.malware',
      version: '1',
      supportedMediaTypes: Object.freeze(['image/png']),
    }),
    async scan() {
      return Object.freeze({
        verdict: 'clean' as const,
        findingCodes: Object.freeze([]),
      });
    },
  });
  return createBinaryAssetScannerChain({
    id: 'test.g4-v2.required-scanner-chain',
    version: '1',
    supportedMediaTypes: ['image/png'],
    scanners: [structural, malware],
  });
};
