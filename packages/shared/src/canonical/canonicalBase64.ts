export type CanonicalBase64DecodeOptions = Readonly<{
  label: string;
  maximumBytes: number;
}>;

const base64Digit = (code: number): number => {
  if (code >= 65 && code <= 90) return code - 65;
  if (code >= 97 && code <= 122) return code - 97 + 26;
  if (code >= 48 && code <= 57) return code - 48 + 52;
  if (code === 43) return 62;
  if (code === 47) return 63;
  return -1;
};

const decodedByteLength = (value: string): number => {
  if (value.length === 0) return 0;
  const padding =
    value.charCodeAt(value.length - 1) === 61
      ? value.charCodeAt(value.length - 2) === 61
        ? 2
        : 1
      : 0;
  return (value.length / 4) * 3 - padding;
};

/**
 * Validates standard padded base64 in linear time without a quantified-group
 * regexp. V8 can exhaust its regexp stack on otherwise valid multi-megabyte
 * payloads, so protocol boundaries must use this bounded scanner.
 */
export const isCanonicalBase64Text = (
  value: unknown,
  maximumBytes: number
): value is string => {
  if (
    typeof value !== 'string' ||
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 0 ||
    value.length % 4 !== 0
  ) {
    return false;
  }
  const byteLength = decodedByteLength(value);
  if (!Number.isSafeInteger(byteLength) || byteLength > maximumBytes) {
    return false;
  }
  const padding =
    value.length > 0 && value.charCodeAt(value.length - 1) === 61
      ? value.charCodeAt(value.length - 2) === 61
        ? 2
        : 1
      : 0;
  const contentLength = value.length - padding;
  for (let index = 0; index < contentLength; index += 1) {
    if (base64Digit(value.charCodeAt(index)) < 0) return false;
  }
  for (let index = contentLength; index < value.length; index += 1) {
    if (value.charCodeAt(index) !== 61) return false;
  }
  if (padding === 2) {
    return (
      contentLength >= 2 &&
      (base64Digit(value.charCodeAt(contentLength - 1)) & 0x0f) === 0
    );
  }
  if (padding === 1) {
    return (
      contentLength >= 3 &&
      (base64Digit(value.charCodeAt(contentLength - 1)) & 0x03) === 0
    );
  }
  return true;
};

/** Decodes canonical base64 with a pre-allocation byte bound. */
export const decodeCanonicalBase64 = (
  value: unknown,
  options: CanonicalBase64DecodeOptions
): Uint8Array => {
  if (!isCanonicalBase64Text(value, options.maximumBytes)) {
    throw new TypeError(`${options.label} must be bounded canonical base64.`);
  }
  const output = new Uint8Array(decodedByteLength(value));
  let outputIndex = 0;
  for (let index = 0; index < value.length; index += 4) {
    const first = base64Digit(value.charCodeAt(index));
    const second = base64Digit(value.charCodeAt(index + 1));
    const thirdCode = value.charCodeAt(index + 2);
    const fourthCode = value.charCodeAt(index + 3);
    const third = thirdCode === 61 ? 0 : base64Digit(thirdCode);
    const fourth = fourthCode === 61 ? 0 : base64Digit(fourthCode);
    output[outputIndex] = (first << 2) | (second >> 4);
    outputIndex += 1;
    if (thirdCode !== 61) {
      output[outputIndex] = ((second & 0x0f) << 4) | (third >> 2);
      outputIndex += 1;
    }
    if (fourthCode !== 61) {
      output[outputIndex] = ((third & 0x03) << 6) | fourth;
      outputIndex += 1;
    }
  }
  return output;
};
