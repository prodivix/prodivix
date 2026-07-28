const OUTPUT_CHUNK_SIZE = 2_048;

const appendCodePoint = (
  codePoints: number[],
  output: string[],
  codePoint: number
): void => {
  codePoints.push(codePoint);
  if (codePoints.length >= OUTPUT_CHUNK_SIZE) {
    output.push(String.fromCodePoint(...codePoints));
    codePoints.length = 0;
  }
};

const decodeUtf8 = (contents: Uint8Array): string | undefined => {
  const output: string[] = [];
  const codePoints: number[] = [];
  let offset = 0;
  while (offset < contents.byteLength) {
    const first = contents[offset] as number;
    let codePoint: number;
    let width: number;
    if (first <= 0x7f) {
      codePoint = first;
      width = 1;
    } else if (first >= 0xc2 && first <= 0xdf) {
      codePoint = first & 0x1f;
      width = 2;
    } else if (first >= 0xe0 && first <= 0xef) {
      codePoint = first & 0x0f;
      width = 3;
    } else if (first >= 0xf0 && first <= 0xf4) {
      codePoint = first & 0x07;
      width = 4;
    } else {
      return undefined;
    }

    if (offset + width > contents.byteLength) {
      return undefined;
    }
    const second = contents[offset + 1] as number;
    const secondIsContinuation = second >= 0x80 && second <= 0xbf;
    const secondIsCanonical =
      (first !== 0xe0 || second >= 0xa0) &&
      (first !== 0xed || second <= 0x9f) &&
      (first !== 0xf0 || second >= 0x90) &&
      (first !== 0xf4 || second <= 0x8f);
    if (width > 1 && (!secondIsContinuation || !secondIsCanonical)) {
      return undefined;
    }
    for (let index = 1; index < width; index += 1) {
      const continuation = contents[offset + index] as number;
      if (continuation < 0x80 || continuation > 0xbf) {
        return undefined;
      }
      codePoint = (codePoint << 6) | (continuation & 0x3f);
    }
    appendCodePoint(codePoints, output, codePoint);
    offset += width;
  }
  if (codePoints.length) output.push(String.fromCodePoint(...codePoints));
  const decoded = output.join('');
  return decoded.charCodeAt(0) === 0xfeff ? undefined : decoded;
};

export const decodeVerificationArtifactUtf8Strict = (
  contents: Uint8Array
): string | undefined => decodeUtf8(contents);
