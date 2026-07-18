import {
  BINARY_ASSET_LIMITS,
  type BinaryAssetImageMetadata,
} from './binaryAsset.types';

const JPEG_START_OF_IMAGE = 0xd8;
const JPEG_END_OF_IMAGE = 0xd9;
const JPEG_START_OF_SCAN = 0xda;
const JPEG_BASELINE_FRAME = 0xc0;
const JPEG_DEFINE_HUFFMAN_TABLE = 0xc4;
const JPEG_DEFINE_QUANTIZATION_TABLE = 0xdb;
const JPEG_DEFINE_RESTART_INTERVAL = 0xdd;
const JPEG_COMMENT = 0xfe;
const JPEG_ADOBE_APPLICATION_MARKER = 0xee;
const JPEG_EXIF_PREFIX = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0, 0]);
const JPEG_ADOBE_PREFIX = new Uint8Array([0x41, 0x64, 0x6f, 0x62, 0x65]);

export class BinaryAssetJpegValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BinaryAssetJpegValidationError';
  }
}

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength &&
  left.every((byte, index) => byte === right[index]);

const concatBytes = (parts: readonly Uint8Array[]): Uint8Array => {
  const byteLength = parts.reduce((total, part) => total + part.byteLength, 0);
  const result = new Uint8Array(byteLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
};

const readUint16BigEndian = (contents: Uint8Array, offset: number): number =>
  ((contents[offset] ?? 0) << 8) | (contents[offset + 1] ?? 0);

const validateExifOrientation = (data: Uint8Array): void => {
  if (
    data.byteLength < JPEG_EXIF_PREFIX.byteLength ||
    !equalBytes(data.subarray(0, JPEG_EXIF_PREFIX.byteLength), JPEG_EXIF_PREFIX)
  ) {
    if (
      data.byteLength >= 4 &&
      String.fromCharCode(...data.subarray(0, 4)) === 'Exif'
    ) {
      throw new BinaryAssetJpegValidationError('JPEG EXIF header is invalid.');
    }
    return;
  }
  const tiff = data.subarray(JPEG_EXIF_PREFIX.byteLength);
  if (tiff.byteLength < 8) {
    throw new BinaryAssetJpegValidationError('JPEG EXIF TIFF data is invalid.');
  }
  const littleEndian = tiff[0] === 0x49 && tiff[1] === 0x49;
  const bigEndian = tiff[0] === 0x4d && tiff[1] === 0x4d;
  if (!littleEndian && !bigEndian) {
    throw new BinaryAssetJpegValidationError(
      'JPEG EXIF byte order is invalid.'
    );
  }
  const read16 = (offset: number): number => {
    if (offset < 0 || offset > tiff.byteLength - 2) {
      throw new BinaryAssetJpegValidationError('JPEG EXIF offset is invalid.');
    }
    return littleEndian
      ? (tiff[offset] ?? 0) | ((tiff[offset + 1] ?? 0) << 8)
      : ((tiff[offset] ?? 0) << 8) | (tiff[offset + 1] ?? 0);
  };
  const read32 = (offset: number): number => {
    if (offset < 0 || offset > tiff.byteLength - 4) {
      throw new BinaryAssetJpegValidationError('JPEG EXIF offset is invalid.');
    }
    return littleEndian
      ? ((tiff[offset] ?? 0) |
          ((tiff[offset + 1] ?? 0) << 8) |
          ((tiff[offset + 2] ?? 0) << 16) |
          ((tiff[offset + 3] ?? 0) << 24)) >>>
          0
      : (((tiff[offset] ?? 0) << 24) |
          ((tiff[offset + 1] ?? 0) << 16) |
          ((tiff[offset + 2] ?? 0) << 8) |
          (tiff[offset + 3] ?? 0)) >>>
          0;
  };
  if (read16(2) !== 42) {
    throw new BinaryAssetJpegValidationError(
      'JPEG EXIF TIFF magic is invalid.'
    );
  }
  const firstDirectoryOffset = read32(4);
  if (firstDirectoryOffset < 8 || firstDirectoryOffset > tiff.byteLength - 2) {
    throw new BinaryAssetJpegValidationError(
      'JPEG EXIF directory offset is invalid.'
    );
  }
  const entryCount = read16(firstDirectoryOffset);
  if (
    entryCount > 256 ||
    firstDirectoryOffset + 2 + entryCount * 12 + 4 > tiff.byteLength
  ) {
    throw new BinaryAssetJpegValidationError(
      'JPEG EXIF directory exceeds policy.'
    );
  }
  let seenOrientation = false;
  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = firstDirectoryOffset + 2 + index * 12;
    if (read16(entryOffset) !== 0x0112) continue;
    if (
      seenOrientation ||
      read16(entryOffset + 2) !== 3 ||
      read32(entryOffset + 4) !== 1 ||
      read16(entryOffset + 8) !== 1
    ) {
      throw new BinaryAssetJpegValidationError(
        'JPEG EXIF orientation requires pixel normalization.'
      );
    }
    seenOrientation = true;
  }
};

const readQuantizationTables = (
  data: Uint8Array,
  tableIds: Set<number>
): void => {
  let offset = 0;
  while (offset < data.byteLength) {
    const profile = data[offset];
    if (profile === undefined) {
      throw new BinaryAssetJpegValidationError('JPEG DQT is truncated.');
    }
    const precision = profile >> 4;
    const tableId = profile & 0x0f;
    const tableBytes = precision === 0 ? 64 : precision === 1 ? 128 : 0;
    if (
      tableBytes === 0 ||
      tableId > 3 ||
      tableIds.has(tableId) ||
      offset + 1 + tableBytes > data.byteLength
    ) {
      throw new BinaryAssetJpegValidationError('JPEG DQT is invalid.');
    }
    const values = data.subarray(offset + 1, offset + 1 + tableBytes);
    if (
      precision === 0
        ? values.some((value) => value === 0)
        : Array.from({ length: 64 }, (_, index) =>
            readUint16BigEndian(values, index * 2)
          ).some((value) => value === 0)
    ) {
      throw new BinaryAssetJpegValidationError(
        'JPEG quantization table contains zero.'
      );
    }
    tableIds.add(tableId);
    offset += 1 + tableBytes;
  }
  if (offset !== data.byteLength) {
    throw new BinaryAssetJpegValidationError('JPEG DQT length is invalid.');
  }
};

const readHuffmanTables = (
  data: Uint8Array,
  dcTableIds: Set<number>,
  acTableIds: Set<number>
): void => {
  let offset = 0;
  while (offset < data.byteLength) {
    if (offset > data.byteLength - 17) {
      throw new BinaryAssetJpegValidationError('JPEG DHT is truncated.');
    }
    const profile = data[offset] as number;
    const tableClass = profile >> 4;
    const tableId = profile & 0x0f;
    const codeCounts = data.subarray(offset + 1, offset + 17);
    const symbolCount = codeCounts.reduce((total, value) => total + value, 0);
    const target = tableClass === 0 ? dcTableIds : acTableIds;
    if (
      tableClass > 1 ||
      tableId > 3 ||
      target.has(tableId) ||
      symbolCount < 1 ||
      symbolCount > 256 ||
      offset + 17 + symbolCount > data.byteLength
    ) {
      throw new BinaryAssetJpegValidationError('JPEG DHT is invalid.');
    }
    let availableCodes = 1;
    for (const count of codeCounts) {
      availableCodes = availableCodes * 2 - count;
      if (availableCodes < 0) {
        throw new BinaryAssetJpegValidationError(
          'JPEG Huffman code lengths are oversubscribed.'
        );
      }
    }
    if (availableCodes === 0) {
      throw new BinaryAssetJpegValidationError(
        'JPEG Huffman table uses the reserved all-ones code.'
      );
    }
    const symbols = data.subarray(offset + 17, offset + 17 + symbolCount);
    const uniqueSymbols = new Set<number>();
    for (const symbol of symbols) {
      const acSize = symbol & 0x0f;
      const acRun = symbol >> 4;
      const validSymbol =
        tableClass === 0
          ? symbol <= 11
          : (acRun === 0 && acSize === 0) ||
            (acRun === 15 && acSize === 0) ||
            (acSize >= 1 && acSize <= 10);
      if (!validSymbol || uniqueSymbols.has(symbol)) {
        throw new BinaryAssetJpegValidationError(
          'JPEG Huffman symbol is invalid.'
        );
      }
      uniqueSymbols.add(symbol);
    }
    target.add(tableId);
    offset += 17 + symbolCount;
  }
};

type JpegFrameComponent = Readonly<{
  quantizationTableId: number;
}>;

const readBaselineFrame = (
  data: Uint8Array,
  quantizationTableIds: ReadonlySet<number>
): Readonly<{
  metadata: BinaryAssetImageMetadata;
  components: ReadonlyMap<number, JpegFrameComponent>;
}> => {
  const componentCount = data[5] ?? 0;
  const width = readUint16BigEndian(data, 3);
  const height = readUint16BigEndian(data, 1);
  if (
    data.byteLength !== 6 + componentCount * 3 ||
    data[0] !== 8 ||
    (componentCount !== 1 && componentCount !== 3) ||
    width < 1 ||
    height < 1 ||
    width > BINARY_ASSET_LIMITS.maxImageWidth ||
    height > BINARY_ASSET_LIMITS.maxImageHeight ||
    width * height > BINARY_ASSET_LIMITS.maxImagePixels
  ) {
    throw new BinaryAssetJpegValidationError(
      'JPEG baseline frame exceeds policy.'
    );
  }
  const components = new Map<number, JpegFrameComponent>();
  let totalSamplingBlocks = 0;
  for (let index = 0; index < componentCount; index += 1) {
    const offset = 6 + index * 3;
    const componentId = data[offset] ?? 0;
    const sampling = data[offset + 1] ?? 0;
    const horizontalSampling = sampling >> 4;
    const verticalSampling = sampling & 0x0f;
    const quantizationTableId = data[offset + 2] ?? 0xff;
    if (
      components.has(componentId) ||
      horizontalSampling < 1 ||
      horizontalSampling > 4 ||
      verticalSampling < 1 ||
      verticalSampling > 4 ||
      !quantizationTableIds.has(quantizationTableId)
    ) {
      throw new BinaryAssetJpegValidationError(
        'JPEG baseline frame component is invalid.'
      );
    }
    totalSamplingBlocks += horizontalSampling * verticalSampling;
    components.set(componentId, Object.freeze({ quantizationTableId }));
  }
  if (totalSamplingBlocks > 10) {
    throw new BinaryAssetJpegValidationError(
      'JPEG sampling factors exceed policy.'
    );
  }
  return Object.freeze({
    metadata: Object.freeze({ width, height }),
    components,
  });
};

const readBaselineScan = (
  data: Uint8Array,
  components: ReadonlyMap<number, JpegFrameComponent>,
  scannedComponentIds: Set<number>,
  dcTableIds: ReadonlySet<number>,
  acTableIds: ReadonlySet<number>
): void => {
  const componentCount = data[0] ?? 0;
  if (
    componentCount < 1 ||
    componentCount > components.size ||
    data.byteLength !== 1 + componentCount * 2 + 3 ||
    data[data.byteLength - 3] !== 0 ||
    data[data.byteLength - 2] !== 63 ||
    data[data.byteLength - 1] !== 0
  ) {
    throw new BinaryAssetJpegValidationError('JPEG baseline scan is invalid.');
  }
  const localComponentIds = new Set<number>();
  for (let index = 0; index < componentCount; index += 1) {
    const offset = 1 + index * 2;
    const componentId = data[offset] ?? 0;
    const tables = data[offset + 1] ?? 0xff;
    const dcTableId = tables >> 4;
    const acTableId = tables & 0x0f;
    if (
      !components.has(componentId) ||
      localComponentIds.has(componentId) ||
      scannedComponentIds.has(componentId) ||
      !dcTableIds.has(dcTableId) ||
      !acTableIds.has(acTableId)
    ) {
      throw new BinaryAssetJpegValidationError(
        'JPEG baseline scan component is invalid.'
      );
    }
    localComponentIds.add(componentId);
    scannedComponentIds.add(componentId);
  }
};

const canonicalSegment = (
  marker: number,
  lengthBytesAndData: Uint8Array
): Uint8Array =>
  concatBytes([new Uint8Array([0xff, marker]), lengthBytesAndData]);

export type SanitizedBinaryAssetJpeg = Readonly<{
  contents: Uint8Array;
  metadata: BinaryAssetImageMetadata;
}>;

/**
 * Validates one bounded 8-bit baseline JPEG and removes application metadata.
 * Entropy-coded pixel bytes remain exact; non-default EXIF orientation requires
 * a future decode/re-encode transformer and therefore fails closed here.
 */
export const sanitizeBinaryAssetJpeg = (
  input: Uint8Array
): SanitizedBinaryAssetJpeg => {
  if (
    !(input instanceof Uint8Array) ||
    input.byteLength < 4 ||
    input.byteLength > BINARY_ASSET_LIMITS.maxBlobBytes ||
    input[0] !== 0xff ||
    input[1] !== JPEG_START_OF_IMAGE
  ) {
    throw new BinaryAssetJpegValidationError(
      'JPEG signature or size is invalid.'
    );
  }

  const outputParts: Uint8Array[] = [new Uint8Array([0xff, 0xd8])];
  const quantizationTableIds = new Set<number>();
  const dcTableIds = new Set<number>();
  const acTableIds = new Set<number>();
  const scannedComponentIds = new Set<number>();
  let offset = 2;
  let segmentCount = 0;
  let scanCount = 0;
  let frame:
    | Readonly<{
        metadata: BinaryAssetImageMetadata;
        components: ReadonlyMap<number, JpegFrameComponent>;
      }>
    | undefined;
  let seenRestartInterval = false;
  let seenAdobeMarker = false;
  let seenEnd = false;

  while (offset < input.byteLength) {
    segmentCount += 1;
    if (segmentCount > BINARY_ASSET_LIMITS.maxJpegSegments) {
      throw new BinaryAssetJpegValidationError(
        'JPEG contains too many segments.'
      );
    }
    if (input[offset] !== 0xff) {
      throw new BinaryAssetJpegValidationError('JPEG marker is missing.');
    }
    let markerOffset = offset + 1;
    while (markerOffset < input.byteLength && input[markerOffset] === 0xff) {
      markerOffset += 1;
    }
    if (markerOffset >= input.byteLength) {
      throw new BinaryAssetJpegValidationError('JPEG marker is truncated.');
    }
    const marker = input[markerOffset] as number;
    if (marker === 0 || marker === JPEG_START_OF_IMAGE) {
      throw new BinaryAssetJpegValidationError('JPEG marker is invalid.');
    }
    const lengthOffset = markerOffset + 1;
    if (marker === JPEG_END_OF_IMAGE) {
      if (
        !frame ||
        scanCount < 1 ||
        scannedComponentIds.size !== frame.components.size ||
        lengthOffset !== input.byteLength
      ) {
        throw new BinaryAssetJpegValidationError('JPEG EOI is invalid.');
      }
      outputParts.push(new Uint8Array([0xff, JPEG_END_OF_IMAGE]));
      offset = lengthOffset;
      seenEnd = true;
      break;
    }
    if (
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7) ||
      lengthOffset > input.byteLength - 2
    ) {
      throw new BinaryAssetJpegValidationError(
        'JPEG standalone marker is misplaced.'
      );
    }
    const segmentLength = readUint16BigEndian(input, lengthOffset);
    const segmentEnd = lengthOffset + segmentLength;
    if (
      segmentLength < 2 ||
      segmentEnd < lengthOffset ||
      segmentEnd > input.byteLength
    ) {
      throw new BinaryAssetJpegValidationError(
        'JPEG segment length is invalid.'
      );
    }
    const data = input.subarray(lengthOffset + 2, segmentEnd);
    const rawLengthAndData = input.slice(lengthOffset, segmentEnd);

    if (marker >= 0xe0 && marker <= 0xef) {
      if (marker === 0xe1) validateExifOrientation(data);
      if (marker === JPEG_ADOBE_APPLICATION_MARKER) {
        if (
          seenAdobeMarker ||
          scanCount > 0 ||
          data.byteLength !== 12 ||
          !equalBytes(
            data.subarray(0, JPEG_ADOBE_PREFIX.byteLength),
            JPEG_ADOBE_PREFIX
          ) ||
          (data[11] ?? 0xff) > 2
        ) {
          throw new BinaryAssetJpegValidationError(
            'JPEG Adobe application marker is invalid.'
          );
        }
        seenAdobeMarker = true;
        outputParts.push(canonicalSegment(marker, rawLengthAndData));
      }
      offset = segmentEnd;
      continue;
    }
    if (marker === JPEG_COMMENT) {
      offset = segmentEnd;
      continue;
    }

    switch (marker) {
      case JPEG_DEFINE_QUANTIZATION_TABLE:
        if (frame || scanCount > 0) {
          throw new BinaryAssetJpegValidationError(
            'JPEG table redefinition is unsupported.'
          );
        }
        readQuantizationTables(data, quantizationTableIds);
        break;
      case JPEG_DEFINE_HUFFMAN_TABLE:
        if (scanCount > 0) {
          throw new BinaryAssetJpegValidationError(
            'JPEG table redefinition is unsupported.'
          );
        }
        readHuffmanTables(data, dcTableIds, acTableIds);
        break;
      case JPEG_DEFINE_RESTART_INTERVAL:
        if (seenRestartInterval || scanCount > 0 || data.byteLength !== 2) {
          throw new BinaryAssetJpegValidationError(
            'JPEG restart interval is invalid.'
          );
        }
        seenRestartInterval = true;
        break;
      case JPEG_BASELINE_FRAME:
        if (frame || scanCount > 0 || quantizationTableIds.size < 1) {
          throw new BinaryAssetJpegValidationError(
            'JPEG baseline frame order is invalid.'
          );
        }
        frame = readBaselineFrame(data, quantizationTableIds);
        break;
      case JPEG_START_OF_SCAN: {
        if (
          !frame ||
          dcTableIds.size < 1 ||
          acTableIds.size < 1 ||
          scanCount >= BINARY_ASSET_LIMITS.maxJpegScans
        ) {
          throw new BinaryAssetJpegValidationError(
            'JPEG scan order is invalid.'
          );
        }
        readBaselineScan(
          data,
          frame.components,
          scannedComponentIds,
          dcTableIds,
          acTableIds
        );
        scanCount += 1;
        outputParts.push(canonicalSegment(marker, rawLengthAndData));
        const entropyStart = segmentEnd;
        let cursor = entropyStart;
        let entropySymbols = 0;
        while (cursor < input.byteLength) {
          if (input[cursor] !== 0xff) {
            entropySymbols += 1;
            cursor += 1;
            continue;
          }
          if (cursor >= input.byteLength - 1) {
            throw new BinaryAssetJpegValidationError(
              'JPEG entropy data is truncated.'
            );
          }
          const next = input[cursor + 1] as number;
          if (next === 0) {
            entropySymbols += 1;
            cursor += 2;
            continue;
          }
          if (next >= 0xd0 && next <= 0xd7) {
            cursor += 2;
            continue;
          }
          break;
        }
        if (entropySymbols < 1 || cursor >= input.byteLength) {
          throw new BinaryAssetJpegValidationError(
            'JPEG entropy data is invalid.'
          );
        }
        outputParts.push(input.slice(entropyStart, cursor));
        offset = cursor;
        continue;
      }
      default:
        throw new BinaryAssetJpegValidationError(
          `JPEG marker ${marker.toString(16)} is unsupported.`
        );
    }
    outputParts.push(canonicalSegment(marker, rawLengthAndData));
    offset = segmentEnd;
  }

  if (!seenEnd || offset !== input.byteLength || !frame) {
    throw new BinaryAssetJpegValidationError('JPEG structure is incomplete.');
  }
  return Object.freeze({
    contents: concatBytes(outputParts),
    metadata: frame.metadata,
  });
};
