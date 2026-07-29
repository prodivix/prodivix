import { deflateSync, inflateSync } from 'node:zlib';
import type { RgbaImage } from './visualComparison';

const PNG_SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const MAXIMUM_PIXELS = 16_777_216;
const MAXIMUM_PNG_BYTES = 64 * 1024 * 1024;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let entry = 0; entry < table.length; entry += 1) {
    let value = entry;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[entry] = value >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = CRC_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
};

const concatBytes = (parts: readonly Uint8Array[]): Uint8Array => {
  const size = parts.reduce((total, part) => total + part.byteLength, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
};

const chunk = (type: string, data: Uint8Array): Uint8Array => {
  const typeBytes = new TextEncoder().encode(type);
  if (typeBytes.byteLength !== 4) {
    throw new TypeError('PNG chunk type must contain four ASCII bytes.');
  }
  const output = new Uint8Array(12 + data.byteLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, data.byteLength, false);
  output.set(typeBytes, 4);
  output.set(data, 8);
  view.setUint32(
    8 + data.byteLength,
    crc32(output.subarray(4, 8 + data.byteLength)),
    false
  );
  return output;
};

const assertRgbaImage = (image: RgbaImage): void => {
  if (
    !(image.data instanceof Uint8Array) ||
    !Number.isSafeInteger(image.width) ||
    !Number.isSafeInteger(image.height) ||
    image.width < 1 ||
    image.height < 1 ||
    image.width * image.height > MAXIMUM_PIXELS ||
    image.data.byteLength !== image.width * image.height * 4
  ) {
    throw new TypeError('RGBA image is invalid or exceeds the PNG budget.');
  }
};

/** Encodes a bounded RGBA raster without metadata or ancillary chunks. */
export const encodeRgbaPng = (image: RgbaImage): Uint8Array => {
  assertRgbaImage(image);
  const ihdr = new Uint8Array(13);
  const header = new DataView(ihdr.buffer);
  header.setUint32(0, image.width, false);
  header.setUint32(4, image.height, false);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowBytes = image.width * 4;
  const scanlines = new Uint8Array(image.height * (rowBytes + 1));
  for (let y = 0; y < image.height; y += 1) {
    const outputOffset = y * (rowBytes + 1);
    scanlines[outputOffset] = 0;
    scanlines.set(
      image.data.subarray(y * rowBytes, (y + 1) * rowBytes),
      outputOffset + 1
    );
  }
  return concatBytes([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', Uint8Array.from(deflateSync(scanlines, { level: 9 }))),
    chunk('IEND', new Uint8Array()),
  ]);
};

const sameBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength &&
  left.every((byte, index) => byte === right[index]);

const readChunk = (
  bytes: Uint8Array,
  offset: number
): Readonly<{ type: string; data: Uint8Array; nextOffset: number }> => {
  if (offset + 12 > bytes.byteLength) {
    throw new TypeError('PNG chunk is truncated.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(offset, false);
  const end = offset + 12 + length;
  if (length > MAXIMUM_PNG_BYTES || end > bytes.byteLength) {
    throw new TypeError('PNG chunk length exceeds its bounded input.');
  }
  const typeBytes = bytes.subarray(offset + 4, offset + 8);
  if (
    !typeBytes.every(
      (byte) => (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a)
    )
  ) {
    throw new TypeError('PNG chunk type is not ASCII alphabetic text.');
  }
  const expectedCrc = view.getUint32(offset + 8 + length, false);
  const actualCrc = crc32(bytes.subarray(offset + 4, offset + 8 + length));
  if (expectedCrc !== actualCrc) {
    throw new TypeError('PNG chunk CRC drifted.');
  }
  return Object.freeze({
    type: new TextDecoder().decode(typeBytes),
    data: bytes.slice(offset + 8, offset + 8 + length),
    nextOffset: end,
  });
};

/**
 * Decodes only the metadata-free RGBA PNG subset produced by encodeRgbaPng.
 * Palette, grayscale, interlaced, filtered, or ancillary-chunk images fail
 * closed instead of being normalized through a host image codec.
 */
export const decodeRgbaPng = (source: Uint8Array): RgbaImage => {
  if (
    !(source instanceof Uint8Array) ||
    source.byteLength < PNG_SIGNATURE.byteLength + 37 ||
    source.byteLength > MAXIMUM_PNG_BYTES ||
    !sameBytes(source.subarray(0, PNG_SIGNATURE.byteLength), PNG_SIGNATURE)
  ) {
    throw new TypeError(
      'RGBA PNG input is invalid or exceeds its byte budget.'
    );
  }
  const ihdr = readChunk(source, PNG_SIGNATURE.byteLength);
  const idat = readChunk(source, ihdr.nextOffset);
  const iend = readChunk(source, idat.nextOffset);
  if (
    ihdr.type !== 'IHDR' ||
    ihdr.data.byteLength !== 13 ||
    idat.type !== 'IDAT' ||
    idat.data.byteLength === 0 ||
    iend.type !== 'IEND' ||
    iend.data.byteLength !== 0 ||
    iend.nextOffset !== source.byteLength
  ) {
    throw new TypeError(
      'RGBA PNG must contain only canonical IHDR, IDAT, and IEND chunks.'
    );
  }
  const header = new DataView(
    ihdr.data.buffer,
    ihdr.data.byteOffset,
    ihdr.data.byteLength
  );
  const width = header.getUint32(0, false);
  const height = header.getUint32(4, false);
  if (
    width < 1 ||
    height < 1 ||
    width * height > MAXIMUM_PIXELS ||
    ihdr.data[8] !== 8 ||
    ihdr.data[9] !== 6 ||
    ihdr.data[10] !== 0 ||
    ihdr.data[11] !== 0 ||
    ihdr.data[12] !== 0
  ) {
    throw new TypeError(
      'RGBA PNG header must use bounded 8-bit non-interlaced RGBA.'
    );
  }
  const rowBytes = width * 4;
  const expectedInflatedSize = height * (rowBytes + 1);
  let scanlines: Uint8Array;
  try {
    scanlines = Uint8Array.from(
      inflateSync(idat.data, {
        maxOutputLength: expectedInflatedSize,
      })
    );
  } catch (error) {
    throw new TypeError('RGBA PNG compressed data is invalid or oversized.', {
      cause: error,
    });
  }
  if (scanlines.byteLength !== expectedInflatedSize) {
    throw new TypeError('RGBA PNG scanline size drifted.');
  }
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const inputOffset = y * (rowBytes + 1);
    if (scanlines[inputOffset] !== 0) {
      throw new TypeError('RGBA PNG uses an unsupported scanline filter.');
    }
    data.set(
      scanlines.subarray(inputOffset + 1, inputOffset + 1 + rowBytes),
      y * rowBytes
    );
  }
  const image = Object.freeze({ width, height, data });
  assertRgbaImage(image);
  return image;
};

const paethPredictor = (
  left: number,
  above: number,
  upperLeft: number
): number => {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
    return left;
  }
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
};

/**
 * Decodes the bounded 8-bit RGBA PNG subset emitted by browser screenshots.
 * Standard row filters, RGB/RGBA color, and ancillary metadata are accepted,
 * while alternate color models, interlacing, unknown critical chunks, and
 * oversized input continue to fail closed.
 */
export const decodeBrowserRgbaPng = (source: Uint8Array): RgbaImage => {
  if (
    !(source instanceof Uint8Array) ||
    source.byteLength < PNG_SIGNATURE.byteLength + 37 ||
    source.byteLength > MAXIMUM_PNG_BYTES ||
    !sameBytes(source.subarray(0, PNG_SIGNATURE.byteLength), PNG_SIGNATURE)
  ) {
    throw new TypeError(
      'Browser RGBA PNG input is invalid or exceeds its byte budget.'
    );
  }

  let offset = PNG_SIGNATURE.byteLength;
  let ihdr: Uint8Array | undefined;
  const idatParts: Uint8Array[] = [];
  let sawIdat = false;
  let completedIdat = false;
  let sawIend = false;
  while (offset < source.byteLength) {
    const current = readChunk(source, offset);
    offset = current.nextOffset;
    if (sawIend) {
      throw new TypeError('Browser RGBA PNG contains data after IEND.');
    }
    if (current.type === 'IHDR') {
      if (ihdr || sawIdat || current.data.byteLength !== 13) {
        throw new TypeError('Browser RGBA PNG has an invalid IHDR.');
      }
      ihdr = current.data;
      continue;
    }
    if (current.type === 'IDAT') {
      if (!ihdr || completedIdat || current.data.byteLength === 0) {
        throw new TypeError('Browser RGBA PNG has an invalid IDAT sequence.');
      }
      sawIdat = true;
      idatParts.push(current.data);
      continue;
    }
    if (sawIdat) completedIdat = true;
    if (current.type === 'IEND') {
      if (
        !ihdr ||
        !sawIdat ||
        current.data.byteLength !== 0 ||
        offset !== source.byteLength
      ) {
        throw new TypeError('Browser RGBA PNG has an invalid IEND.');
      }
      sawIend = true;
      continue;
    }
    const ancillary = current.type.charCodeAt(0) >= 0x61;
    if (!ancillary) {
      throw new TypeError(
        `Browser RGBA PNG uses unsupported critical chunk ${current.type}.`
      );
    }
  }
  if (!ihdr || !sawIdat || !sawIend) {
    throw new TypeError('Browser RGBA PNG is missing a required chunk.');
  }

  const header = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
  const width = header.getUint32(0, false);
  const height = header.getUint32(4, false);
  const colorType = ihdr[9];
  if (
    width < 1 ||
    height < 1 ||
    width * height > MAXIMUM_PIXELS ||
    ihdr[8] !== 8 ||
    (colorType !== 2 && colorType !== 6) ||
    ihdr[10] !== 0 ||
    ihdr[11] !== 0 ||
    ihdr[12] !== 0
  ) {
    throw new TypeError(
      'Browser PNG must use bounded 8-bit non-interlaced RGB or RGBA.'
    );
  }

  const bytesPerPixel = colorType === 2 ? 3 : 4;
  const rowBytes = width * bytesPerPixel;
  const expectedInflatedSize = height * (rowBytes + 1);
  let scanlines: Uint8Array;
  try {
    scanlines = Uint8Array.from(
      inflateSync(concatBytes(idatParts), {
        maxOutputLength: expectedInflatedSize,
      })
    );
  } catch (error) {
    throw new TypeError(
      'Browser RGBA PNG compressed data is invalid or oversized.',
      { cause: error }
    );
  }
  if (scanlines.byteLength !== expectedInflatedSize) {
    throw new TypeError('Browser RGBA PNG scanline size drifted.');
  }

  const decoded = new Uint8Array(width * height * bytesPerPixel);
  for (let y = 0; y < height; y += 1) {
    const inputOffset = y * (rowBytes + 1);
    const filter = scanlines[inputOffset];
    if (filter === undefined || filter > 4) {
      throw new TypeError('Browser RGBA PNG uses an unsupported row filter.');
    }
    const outputOffset = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const sourceByte = scanlines[inputOffset + x + 1]!;
      const left =
        x >= bytesPerPixel ? decoded[outputOffset + x - bytesPerPixel]! : 0;
      const above = y > 0 ? decoded[outputOffset - rowBytes + x]! : 0;
      const upperLeft =
        y > 0 && x >= bytesPerPixel
          ? decoded[outputOffset - rowBytes + x - bytesPerPixel]!
          : 0;
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? above
              : filter === 3
                ? Math.floor((left + above) / 2)
                : paethPredictor(left, above, upperLeft);
      decoded[outputOffset + x] = (sourceByte + predictor) & 0xff;
    }
  }

  let data = decoded;
  if (colorType === 2) {
    const pixelCount = width * height;
    data = new Uint8Array(pixelCount * 4);
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const rgbOffset = pixel * 3;
      const rgbaOffset = pixel * 4;
      data[rgbaOffset] = decoded[rgbOffset]!;
      data[rgbaOffset + 1] = decoded[rgbOffset + 1]!;
      data[rgbaOffset + 2] = decoded[rgbOffset + 2]!;
      data[rgbaOffset + 3] = 0xff;
    }
  }

  const image = Object.freeze({ width, height, data });
  assertRgbaImage(image);
  return image;
};
