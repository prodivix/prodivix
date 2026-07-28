import type { VerificationArtifactPolicy } from './verificationArtifactPolicy.types';

const PNG_SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const PNG_ALLOWED_CHUNKS = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS']);
const PNG_BIT_DEPTHS = new Map<number, ReadonlySet<number>>([
  [0, new Set([1, 2, 4, 8, 16])],
  [2, new Set([8, 16])],
  [3, new Set([1, 2, 4, 8])],
  [4, new Set([8, 16])],
  [6, new Set([8, 16])],
]);
const JPEG_ALLOWED_SEGMENT_MARKERS = new Set([
  0xc0, 0xc2, 0xc4, 0xda, 0xdb, 0xdd,
]);
const JPEG_FRAME_MARKERS = new Set([0xc0, 0xc2]);

const hasPrefix = (
  contents: Uint8Array,
  prefix: Uint8Array,
  offset = 0
): boolean =>
  offset >= 0 &&
  contents.byteLength >= offset + prefix.byteLength &&
  prefix.every((byte, index) => contents[offset + index] === byte);

export const hasVerificationPngSignature = (contents: Uint8Array): boolean =>
  hasPrefix(contents, PNG_SIGNATURE);

export const hasVerificationJpegSignature = (contents: Uint8Array): boolean =>
  contents.byteLength >= 2 && contents[0] === 0xff && contents[1] === 0xd8;

const readUint32 = (contents: Uint8Array, offset: number): number =>
  (((contents[offset] ?? 0) << 24) |
    ((contents[offset + 1] ?? 0) << 16) |
    ((contents[offset + 2] ?? 0) << 8) |
    (contents[offset + 3] ?? 0)) >>>
  0;

const readUint16 = (contents: Uint8Array, offset: number): number =>
  ((contents[offset] ?? 0) << 8) | (contents[offset + 1] ?? 0);

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

export const inspectVerificationPng = (
  contents: Uint8Array,
  policy: VerificationArtifactPolicy
): Readonly<{ width: number; height: number }> | undefined => {
  if (!hasVerificationPngSignature(contents)) return undefined;
  let offset = PNG_SIGNATURE.byteLength;
  let entries = 0;
  let width = 0;
  let height = 0;
  let seenHeader = false;
  let seenImageData = false;
  let seenEnd = false;
  while (offset < contents.byteLength) {
    entries += 1;
    if (
      entries > policy.maximumImageStructuralEntries ||
      offset > contents.byteLength - 12
    ) {
      return undefined;
    }
    const dataLength = readUint32(contents, offset);
    const typeOffset = offset + 4;
    const dataOffset = typeOffset + 4;
    const dataEnd = dataOffset + dataLength;
    const chunkEnd = dataEnd + 4;
    if (
      dataEnd < dataOffset ||
      chunkEnd > contents.byteLength ||
      dataLength > policy.maximumSingleArtifactBytes
    ) {
      return undefined;
    }
    const typeBytes = contents.subarray(typeOffset, dataOffset);
    if (
      typeBytes.byteLength !== 4 ||
      [...typeBytes].some(
        (byte) => !((byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122))
      )
    ) {
      return undefined;
    }
    const type = String.fromCharCode(...typeBytes);
    if (
      !PNG_ALLOWED_CHUNKS.has(type) ||
      crc32(contents.subarray(typeOffset, dataEnd)) !==
        readUint32(contents, dataEnd)
    ) {
      return undefined;
    }
    if (!seenHeader && type !== 'IHDR') return undefined;
    if (type === 'IHDR') {
      if (
        seenHeader ||
        offset !== PNG_SIGNATURE.byteLength ||
        dataLength !== 13
      ) {
        return undefined;
      }
      width = readUint32(contents, dataOffset);
      height = readUint32(contents, dataOffset + 4);
      const bitDepth = contents[dataOffset + 8] ?? 0;
      const colorType = contents[dataOffset + 9] ?? -1;
      if (
        width < 1 ||
        height < 1 ||
        width > policy.maximumImageWidth ||
        height > policy.maximumImageHeight ||
        width * height > policy.maximumImagePixels ||
        !PNG_BIT_DEPTHS.get(colorType)?.has(bitDepth) ||
        contents[dataOffset + 10] !== 0 ||
        contents[dataOffset + 11] !== 0 ||
        (contents[dataOffset + 12] !== 0 && contents[dataOffset + 12] !== 1)
      ) {
        return undefined;
      }
      seenHeader = true;
    } else if (type === 'IDAT') {
      if (!seenHeader || seenEnd || dataLength < 1) return undefined;
      seenImageData = true;
    } else if (type === 'IEND') {
      if (
        !seenImageData ||
        seenEnd ||
        dataLength !== 0 ||
        chunkEnd !== contents.byteLength
      ) {
        return undefined;
      }
      seenEnd = true;
    } else if (seenImageData) {
      return undefined;
    }
    offset = chunkEnd;
  }
  return seenHeader && seenImageData && seenEnd
    ? Object.freeze({ width, height })
    : undefined;
};

export const inspectVerificationJpeg = (
  contents: Uint8Array,
  policy: VerificationArtifactPolicy
): Readonly<{ width: number; height: number }> | undefined => {
  if (!hasVerificationJpegSignature(contents) || contents.byteLength < 4) {
    return undefined;
  }
  let offset = 2;
  let entries = 0;
  let width = 0;
  let height = 0;
  let seenFrame = false;
  let seenScan = false;
  let seenEnd = false;
  while (offset < contents.byteLength) {
    entries += 1;
    if (
      entries > policy.maximumImageStructuralEntries ||
      contents[offset] !== 0xff
    ) {
      return undefined;
    }
    while (offset < contents.byteLength && contents[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= contents.byteLength) return undefined;
    const marker = contents[offset] as number;
    offset += 1;
    if (marker === 0xd9) {
      seenEnd = offset === contents.byteLength;
      break;
    }
    if (
      marker === 0x00 ||
      marker === 0xd8 ||
      (marker >= 0xd0 && marker <= 0xd7) ||
      !JPEG_ALLOWED_SEGMENT_MARKERS.has(marker) ||
      offset > contents.byteLength - 2
    ) {
      return undefined;
    }
    const segmentLength = readUint16(contents, offset);
    const segmentEnd = offset + segmentLength;
    if (
      segmentLength < 2 ||
      segmentEnd < offset ||
      segmentEnd > contents.byteLength
    ) {
      return undefined;
    }
    const dataOffset = offset + 2;
    const dataLength = segmentLength - 2;
    if (JPEG_FRAME_MARKERS.has(marker)) {
      const componentCount = contents[dataOffset + 5] ?? 0;
      if (
        seenFrame ||
        dataLength !== 6 + componentCount * 3 ||
        contents[dataOffset] !== 8 ||
        componentCount < 1 ||
        componentCount > 4
      ) {
        return undefined;
      }
      height = readUint16(contents, dataOffset + 1);
      width = readUint16(contents, dataOffset + 3);
      if (
        width < 1 ||
        height < 1 ||
        width > policy.maximumImageWidth ||
        height > policy.maximumImageHeight ||
        width * height > policy.maximumImagePixels
      ) {
        return undefined;
      }
      seenFrame = true;
    }
    offset = segmentEnd;
    if (marker !== 0xda) continue;
    if (!seenFrame || dataLength < 6) return undefined;
    seenScan = true;
    while (offset < contents.byteLength) {
      if (contents[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      if (offset >= contents.byteLength - 1) return undefined;
      const next = contents[offset + 1] as number;
      if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
        offset += 2;
        continue;
      }
      break;
    }
  }
  return seenFrame && seenScan && seenEnd
    ? Object.freeze({ width, height })
    : undefined;
};
