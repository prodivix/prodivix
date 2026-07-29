import { describe, expect, it } from 'vitest';
import { createPngBrowserVerificationArtifact } from './browserVerificationArtifacts';
import { encodeRgbaPng } from './rgbaPng';

const concatBytes = (parts: readonly Uint8Array[]): Uint8Array => {
  const output = new Uint8Array(
    parts.reduce((size, part) => size + part.byteLength, 0)
  );
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
};

const crcTable = (() => {
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
    value = crcTable[(value ^ byte) & 0xff]! ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
};

const ancillaryChunk = (text: string): Uint8Array => {
  const type = new TextEncoder().encode('tEXt');
  const data = new TextEncoder().encode(text);
  const output = new Uint8Array(12 + data.byteLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, data.byteLength, false);
  output.set(type, 4);
  output.set(data, 8);
  view.setUint32(
    8 + data.byteLength,
    crc32(output.subarray(4, 8 + data.byteLength)),
    false
  );
  return output;
};

const canonical = (): Uint8Array =>
  encodeRgbaPng({
    width: 1,
    height: 1,
    data: Uint8Array.from([0, 0, 0, 255]),
  });

describe('browser raster artifact boundary', () => {
  it('stages only the canonical metadata-free RGBA encoding', () => {
    const bytes = canonical();
    const artifact = createPngBrowserVerificationArtifact({
      id: 'artifact.screenshot',
      kind: 'screenshot',
      bytes,
    });

    expect(artifact.bytes).toEqual(bytes);
    expect(artifact.size).toBe(bytes.byteLength);
    expect(artifact.digest).toMatch(/^sha256-[a-f0-9]{64}$/u);
  });

  it.each([
    [
      'trailing private bytes',
      (bytes: Uint8Array) =>
        concatBytes([
          bytes,
          new TextEncoder().encode(
            'C:\\private\\workspace\\playwright.schema.vendor'
          ),
        ]),
    ],
    [
      'ancillary private chunk',
      (bytes: Uint8Array) =>
        concatBytes([
          bytes.subarray(0, 33),
          ancillaryChunk('C:\\private\\workspace\\playwright.schema.vendor'),
          bytes.subarray(33),
        ]),
    ],
  ])('rejects %s instead of staging it', (_label, mutate) => {
    expect(() =>
      createPngBrowserVerificationArtifact({
        id: 'artifact.visual-diff',
        kind: 'visual-diff',
        bytes: mutate(canonical()),
      })
    ).toThrow(/canonical|IHDR, IDAT, and IEND/u);
  });
});
