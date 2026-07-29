import { describe, expect, it } from 'vitest';
import { decodeBrowserRgbaPng, decodeRgbaPng, encodeRgbaPng } from './rgbaPng';

describe('bounded canonical RGBA PNG codec', () => {
  const image = Object.freeze({
    width: 2,
    height: 2,
    data: Uint8Array.from([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0,
    ]),
  });

  it('round-trips the exact metadata-free RGBA subset', () => {
    const bytes = encodeRgbaPng(image);
    const decoded = decodeRgbaPng(bytes);

    expect(decoded.width).toBe(image.width);
    expect(decoded.height).toBe(image.height);
    expect([...decoded.data]).toEqual([...image.data]);
    expect(encodeRgbaPng(decoded)).toEqual(bytes);
    expect(decodeBrowserRgbaPng(bytes)).toEqual(decoded);
  });

  it('rejects CRC drift, trailing chunks, and unbounded raster shapes', () => {
    const bytes = encodeRgbaPng(image);
    const crcDrift = new Uint8Array(bytes);
    crcDrift[29] ^= 0xff;
    expect(() => decodeRgbaPng(crcDrift)).toThrow(/CRC/u);
    expect(() => decodeBrowserRgbaPng(crcDrift)).toThrow(/CRC/u);

    const trailing = new Uint8Array(bytes.byteLength + 1);
    trailing.set(bytes);
    expect(() => decodeRgbaPng(trailing)).toThrow(/IHDR, IDAT, and IEND/u);

    expect(() =>
      encodeRgbaPng({
        width: 1,
        height: 1,
        data: new Uint8Array(3),
      })
    ).toThrow(/invalid or exceeds/u);
  });
});
