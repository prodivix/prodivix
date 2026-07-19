export const BINARY_ASSET_BLOB_REFERENCE_KIND = 'workspace-blob' as const;
export const BINARY_ASSET_TRANSFORM_FORMAT =
  'prodivix.binary-asset-transform.v1' as const;
export const BINARY_ASSET_SCAN_ATTESTATION_FORMAT =
  'prodivix.binary-asset-scan-attestation.v1' as const;
export const BINARY_ASSET_PNG_SANITIZE_TRANSFORMER_ID =
  'prodivix.image.png-sanitize' as const;
export const BINARY_ASSET_PNG_SANITIZE_TRANSFORMER_VERSION = '1' as const;
export const BINARY_ASSET_PNG_STRUCTURAL_SCANNER_ID =
  'prodivix.scanner.png-structure' as const;
export const BINARY_ASSET_PNG_STRUCTURAL_SCANNER_VERSION = '1' as const;
export const BINARY_ASSET_JPEG_SANITIZE_TRANSFORMER_ID =
  'prodivix.image.jpeg-sanitize' as const;
export const BINARY_ASSET_JPEG_SANITIZE_TRANSFORMER_VERSION = '1' as const;
export const BINARY_ASSET_PNG_RASTER_REENCODE_TRANSFORMER_ID =
  'prodivix.image.png-raster-reencode' as const;
export const BINARY_ASSET_PNG_RASTER_REENCODE_TRANSFORMER_VERSION =
  '1' as const;
export const BINARY_ASSET_JPEG_RASTER_REENCODE_TRANSFORMER_ID =
  'prodivix.image.jpeg-raster-reencode' as const;
export const BINARY_ASSET_JPEG_RASTER_REENCODE_TRANSFORMER_VERSION =
  '1' as const;
export const BINARY_ASSET_JPEG_STRUCTURAL_SCANNER_ID =
  'prodivix.scanner.jpeg-structure' as const;
export const BINARY_ASSET_JPEG_STRUCTURAL_SCANNER_VERSION = '1' as const;

export const BINARY_ASSET_LIMITS = Object.freeze({
  maxBlobBytes: 32 * 1024 * 1024,
  maxMediaTypeLength: 127,
  maxAssetDocumentIdLength: 256,
  maxTransformParametersBytes: 64 * 1024,
  maxTransformParameterDepth: 32,
  maxTransformParameterNodes: 4_096,
  maxIdentityLength: 128,
  maxScanFindings: 32,
  maxScanFindingCodeLength: 96,
  maxImageWidth: 8_192,
  maxImageHeight: 8_192,
  maxImagePixels: 32 * 1024 * 1024,
  maxPngChunks: 4_096,
  maxJpegSegments: 4_096,
  maxJpegScans: 256,
});

export type BinaryAssetBlobReference = Readonly<{
  kind: typeof BINARY_ASSET_BLOB_REFERENCE_KIND;
  digest: string;
  byteLength: number;
  mediaType: string;
}>;

export type BinaryAssetMaterialization = Readonly<{
  assetDocumentId: string;
  reference: BinaryAssetBlobReference;
  contents: Uint8Array;
}>;

export type BinaryAssetBlobReadRequest = Readonly<{
  workspaceId: string;
  assetDocumentId: string;
  reference: BinaryAssetBlobReference;
}>;

export type BinaryAssetBlobReader = Readonly<{
  read(request: BinaryAssetBlobReadRequest): Promise<Uint8Array | undefined>;
}>;

export type BinaryAssetBlobUploadRequest = Readonly<{
  workspaceId: string;
  mediaType: string;
  contents: Uint8Array;
}>;

export type BinaryAssetBlobUploadResult = Readonly<{
  kind: 'stored' | 'existing';
  reference: BinaryAssetBlobReference;
}>;

export type BinaryAssetBlobUploader = Readonly<{
  upload(
    request: BinaryAssetBlobUploadRequest
  ): Promise<BinaryAssetBlobUploadResult>;
}>;

export type BinaryAssetDeliveryClass =
  'static' | 'download-only' | 'active-content';

export type BinaryAssetDeliveryTransform =
  | 'original'
  | 'png-sanitize'
  | 'jpeg-sanitize'
  | 'png-raster-reencode'
  | 'jpeg-raster-reencode';

export type BinaryAssetDeliveryDisposition = 'attachment' | 'inline';

export type BinaryAssetDeliveryRequest = Readonly<{
  transform: BinaryAssetDeliveryTransform;
  disposition: BinaryAssetDeliveryDisposition;
}>;

export type BinaryAssetTransformJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly BinaryAssetTransformJsonValue[]
  | Readonly<{ [key: string]: BinaryAssetTransformJsonValue }>;

export type BinaryAssetTransformRecipe = Readonly<{
  format: typeof BINARY_ASSET_TRANSFORM_FORMAT;
  sourceDigest: string;
  transformerId: string;
  transformerVersion: string;
  outputMediaType: string;
  parameters: BinaryAssetTransformJsonValue;
  recipeDigest: string;
}>;

export type BinaryAssetImageMetadata = Readonly<{
  width: number;
  height: number;
}>;

export type BinaryAssetTransformerDescriptor = Readonly<{
  id: string;
  version: string;
  inputMediaTypes: readonly string[];
  outputMediaTypes: readonly string[];
}>;

export type BinaryAssetTransformRequest = Readonly<{
  recipe: BinaryAssetTransformRecipe;
  source: BinaryAssetMaterialization;
}>;

export type BinaryAssetTransformResult = Readonly<{
  contents: Uint8Array;
  mediaType: string;
}>;

export type BinaryAssetTransformer = Readonly<{
  descriptor: BinaryAssetTransformerDescriptor;
  transform(
    request: BinaryAssetTransformRequest
  ): Promise<BinaryAssetTransformResult>;
}>;

export type BinaryAssetScanVerdict = 'clean' | 'quarantined';

export type BinaryAssetScanResult = Readonly<{
  verdict: BinaryAssetScanVerdict;
  findingCodes: readonly string[];
}>;

export type BinaryAssetContentScannerDescriptor = Readonly<{
  id: string;
  version: string;
  supportedMediaTypes: readonly string[];
}>;

export type BinaryAssetScanRequest = Readonly<{
  reference: BinaryAssetBlobReference;
  contents: Uint8Array;
}>;

export type BinaryAssetContentScanner = Readonly<{
  descriptor: BinaryAssetContentScannerDescriptor;
  scan(request: BinaryAssetScanRequest): Promise<BinaryAssetScanResult>;
}>;

export type BinaryAssetScanAttestation = Readonly<{
  format: typeof BINARY_ASSET_SCAN_ATTESTATION_FORMAT;
  subjectDigest: string;
  scannerId: string;
  scannerVersion: string;
  verdict: BinaryAssetScanVerdict;
  findingCodes: readonly string[];
}>;

export type BinaryAssetDerivedMaterialization = Readonly<{
  recipe: BinaryAssetTransformRecipe;
  materialization: BinaryAssetMaterialization;
  metadata: BinaryAssetImageMetadata | null;
  scan: BinaryAssetScanAttestation;
}>;

export type BinaryAssetDerivedCache = Readonly<{
  get(
    recipeDigest: string
  ): Promise<BinaryAssetDerivedMaterialization | undefined>;
  put(value: BinaryAssetDerivedMaterialization): Promise<void>;
}>;

export type BinaryAssetTransformPipelineResult = Readonly<{
  kind: 'cache-hit' | 'transformed';
  derived: BinaryAssetDerivedMaterialization;
}>;
