import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const width = 64;
const height = 64;
const rgba = new Uint8Array(width * height * 4);
for (let offset = 0; offset < rgba.length; offset += 4) {
  rgba[offset + 3] = 255;
}

const crcTable = new Uint32Array(256);
for (let entry = 0; entry < crcTable.length; entry += 1) {
  let value = entry;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crcTable[entry] = value >>> 0;
}
const crc32 = (bytes) => {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
};
const concat = (parts) => {
  const output = new Uint8Array(
    parts.reduce((total, part) => total + part.byteLength, 0)
  );
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
};
const chunk = (type, data) => {
  const typeBytes = new TextEncoder().encode(type);
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

const ihdr = new Uint8Array(13);
const header = new DataView(ihdr.buffer);
header.setUint32(0, width, false);
header.setUint32(4, height, false);
ihdr[8] = 8;
ihdr[9] = 6;
const scanlines = new Uint8Array(height * (width * 4 + 1));
for (let y = 0; y < height; y += 1) {
  scanlines.set(
    rgba.subarray(y * width * 4, (y + 1) * width * 4),
    y * (width * 4 + 1) + 1
  );
}
const png = concat([
  Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', Uint8Array.from(deflateSync(scanlines, { level: 9 }))),
  chunk('IEND', new Uint8Array()),
]);
const digest = (bytes) =>
  `sha256-${createHash('sha256').update(bytes).digest('hex')}`;
const dimensions = new Uint8Array(8);
const dimensionView = new DataView(dimensions.buffer);
dimensionView.setUint32(0, width, false);
dimensionView.setUint32(4, height, false);
const rasterDigest = digest(
  concat([
    new TextEncoder().encode('prodivix-rgba-raster-v1\u0000'),
    dimensions,
    rgba,
  ])
);

const outputPath = resolve(
  import.meta.dirname,
  '../testdata/g3-v6-visual-baselines/catalog-image-black-64x64.png'
);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, png);
process.stdout.write(
  `${JSON.stringify({
    outputPath,
    assetDigest: digest(png),
    rasterDigest,
    width,
    height,
  })}\n`
);
