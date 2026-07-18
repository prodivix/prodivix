import {
  BINARY_ASSET_LIMITS,
  type BinaryAssetImageMetadata,
} from './binaryAsset.types';

const PNG_SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const PNG_ALLOWED_OUTPUT_CHUNKS = new Set([
  'IHDR',
  'PLTE',
  'IDAT',
  'IEND',
  'tRNS',
]);
const PNG_BIT_DEPTHS = new Map<number, ReadonlySet<number>>([
  [0, new Set([1, 2, 4, 8, 16])],
  [2, new Set([8, 16])],
  [3, new Set([1, 2, 4, 8])],
  [4, new Set([8, 16])],
  [6, new Set([8, 16])],
]);

export class BinaryAssetPngValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BinaryAssetPngValidationError';
  }
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

const crc32 = (contents: Uint8Array): number => {
  let value = 0xffffffff;
  for (const byte of contents) {
    value = (crcTable[(value ^ byte) & 0xff] ?? 0) ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
};

const readUint32 = (contents: Uint8Array, offset: number): number =>
  (((contents[offset] ?? 0) << 24) |
    ((contents[offset + 1] ?? 0) << 16) |
    ((contents[offset + 2] ?? 0) << 8) |
    (contents[offset + 3] ?? 0)) >>>
  0;

const chunkType = (contents: Uint8Array, offset: number): string => {
  const bytes = contents.subarray(offset, offset + 4);
  if (
    bytes.byteLength !== 4 ||
    [...bytes].some(
      (byte) => !((byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122))
    ) ||
    ((bytes[2] ?? 0) & 0x20) !== 0
  ) {
    throw new BinaryAssetPngValidationError('PNG chunk type is invalid.');
  }
  return String.fromCharCode(...bytes);
};

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

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength &&
  left.every((byte, index) => byte === right[index]);

export type SanitizedBinaryAssetPng = Readonly<{
  contents: Uint8Array;
  metadata: BinaryAssetImageMetadata;
}>;

/**
 * Validates one bounded PNG and deterministically removes non-rendering metadata.
 * Pixel payloads remain byte-exact; a separate decoder/malware adapter can be
 * composed before public delivery when policy requires full raster re-encoding.
 */
export const sanitizeBinaryAssetPng = (
  input: Uint8Array
): SanitizedBinaryAssetPng => {
  if (
    !(input instanceof Uint8Array) ||
    input.byteLength < PNG_SIGNATURE.byteLength + 12 ||
    input.byteLength > BINARY_ASSET_LIMITS.maxBlobBytes ||
    !equalBytes(input.subarray(0, PNG_SIGNATURE.byteLength), PNG_SIGNATURE)
  ) {
    throw new BinaryAssetPngValidationError(
      'PNG signature or size is invalid.'
    );
  }

  const outputParts: Uint8Array[] = [PNG_SIGNATURE];
  let offset = PNG_SIGNATURE.byteLength;
  let chunkCount = 0;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let paletteEntries = 0;
  let totalImageDataBytes = 0;
  let seenHeader = false;
  let seenPalette = false;
  let seenTransparency = false;
  let seenImageData = false;
  let imageDataEnded = false;
  let seenEnd = false;

  while (offset < input.byteLength) {
    chunkCount += 1;
    if (chunkCount > BINARY_ASSET_LIMITS.maxPngChunks) {
      throw new BinaryAssetPngValidationError('PNG contains too many chunks.');
    }
    if (offset > input.byteLength - 12) {
      throw new BinaryAssetPngValidationError('PNG chunk is truncated.');
    }
    const chunkStart = offset;
    const dataLength = readUint32(input, offset);
    const typeOffset = offset + 4;
    const dataOffset = typeOffset + 4;
    const dataEnd = dataOffset + dataLength;
    const chunkEnd = dataEnd + 4;
    if (
      dataLength > BINARY_ASSET_LIMITS.maxBlobBytes ||
      dataEnd < dataOffset ||
      chunkEnd > input.byteLength
    ) {
      throw new BinaryAssetPngValidationError('PNG chunk length is invalid.');
    }
    const type = chunkType(input, typeOffset);
    const expectedCrc = readUint32(input, dataEnd);
    const actualCrc = crc32(input.subarray(typeOffset, dataEnd));
    if (expectedCrc !== actualCrc) {
      throw new BinaryAssetPngValidationError(`PNG ${type} CRC is invalid.`);
    }
    const data = input.subarray(dataOffset, dataEnd);
    if (!seenHeader && type !== 'IHDR') {
      throw new BinaryAssetPngValidationError('PNG IHDR must be first.');
    }
    if (seenImageData && type !== 'IDAT') imageDataEnded = true;

    switch (type) {
      case 'IHDR': {
        if (
          seenHeader ||
          chunkStart !== PNG_SIGNATURE.byteLength ||
          dataLength !== 13
        ) {
          throw new BinaryAssetPngValidationError('PNG IHDR is invalid.');
        }
        width = readUint32(data, 0);
        height = readUint32(data, 4);
        bitDepth = data[8] ?? 0;
        colorType = data[9] ?? -1;
        if (
          width < 1 ||
          height < 1 ||
          width > BINARY_ASSET_LIMITS.maxImageWidth ||
          height > BINARY_ASSET_LIMITS.maxImageHeight ||
          width * height > BINARY_ASSET_LIMITS.maxImagePixels ||
          !PNG_BIT_DEPTHS.get(colorType)?.has(bitDepth) ||
          data[10] !== 0 ||
          data[11] !== 0 ||
          (data[12] !== 0 && data[12] !== 1)
        ) {
          throw new BinaryAssetPngValidationError(
            'PNG image profile exceeds policy.'
          );
        }
        seenHeader = true;
        break;
      }
      case 'PLTE': {
        if (
          seenPalette ||
          seenTransparency ||
          seenImageData ||
          colorType === 0 ||
          colorType === 4 ||
          dataLength < 3 ||
          dataLength > 768 ||
          dataLength % 3 !== 0
        ) {
          throw new BinaryAssetPngValidationError('PNG PLTE is invalid.');
        }
        paletteEntries = dataLength / 3;
        if (colorType === 3 && paletteEntries > 2 ** bitDepth) {
          throw new BinaryAssetPngValidationError(
            'PNG palette exceeds bit depth.'
          );
        }
        seenPalette = true;
        break;
      }
      case 'tRNS': {
        const validLength =
          (colorType === 0 && dataLength === 2) ||
          (colorType === 2 && dataLength === 6) ||
          (colorType === 3 &&
            seenPalette &&
            dataLength >= 1 &&
            dataLength <= paletteEntries);
        if (seenTransparency || seenImageData || !validLength) {
          throw new BinaryAssetPngValidationError('PNG tRNS is invalid.');
        }
        seenTransparency = true;
        break;
      }
      case 'IDAT': {
        if (
          imageDataEnded ||
          (colorType === 3 && !seenPalette) ||
          dataLength > BINARY_ASSET_LIMITS.maxBlobBytes - totalImageDataBytes
        ) {
          throw new BinaryAssetPngValidationError(
            'PNG IDAT sequence is invalid.'
          );
        }
        seenImageData = true;
        totalImageDataBytes += dataLength;
        break;
      }
      case 'IEND': {
        if (
          !seenImageData ||
          seenEnd ||
          dataLength !== 0 ||
          chunkEnd !== input.byteLength
        ) {
          throw new BinaryAssetPngValidationError('PNG IEND is invalid.');
        }
        seenEnd = true;
        break;
      }
      default: {
        if (((input[typeOffset] ?? 0) & 0x20) === 0) {
          throw new BinaryAssetPngValidationError(
            `PNG critical chunk ${type} is unsupported.`
          );
        }
      }
    }

    if (PNG_ALLOWED_OUTPUT_CHUNKS.has(type)) {
      outputParts.push(input.slice(chunkStart, chunkEnd));
    }
    offset = chunkEnd;
  }

  if (!seenHeader || !seenImageData || !seenEnd || totalImageDataBytes < 1) {
    throw new BinaryAssetPngValidationError('PNG structure is incomplete.');
  }
  return Object.freeze({
    contents: concatBytes(outputParts),
    metadata: Object.freeze({ width, height }),
  });
};
