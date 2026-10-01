import { closeSync, fstatSync, openSync, readSync } from 'node:fs';

/** Bounds allocation while reading a file or explicit stdin, including a file that grows after stat. */
export const readBoundedCliInput = (
  path: string,
  maximumBytes: number,
  options: Readonly<{ allowStdin?: boolean; allowEmpty?: boolean }> = {}
): Buffer<ArrayBuffer> => {
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < (options.allowEmpty ? 0 : 1)
  )
    throw new TypeError('CLI input byte limit is invalid.');
  const stdin = options.allowStdin !== false && path === '-';
  const descriptor = stdin ? 0 : openSync(path, 'r');
  try {
    const stat = fstatSync(descriptor);
    if (
      (!stdin && !stat.isFile()) ||
      (stat.isFile() && stat.size > maximumBytes)
    )
      throw new TypeError('CLI input is not a file within its byte limit.');
    const chunks: Buffer<ArrayBuffer>[] = [];
    let total = 0;
    for (;;) {
      const chunk = Buffer.allocUnsafe(
        Math.min(65_536, maximumBytes + 1 - total)
      );
      const count = readSync(descriptor, chunk, 0, chunk.length, null);
      if (!count) break;
      total += count;
      if (total > maximumBytes)
        throw new TypeError('CLI input exceeds its byte limit.');
      chunks.push(chunk.subarray(0, count));
    }
    if (!total && !options.allowEmpty)
      throw new TypeError('CLI input is empty.');
    return Buffer.concat(chunks, total);
  } finally {
    if (!stdin) closeSync(descriptor);
  }
};
