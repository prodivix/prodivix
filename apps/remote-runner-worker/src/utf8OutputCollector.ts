import { StringDecoder } from 'node:string_decoder';

/** Keeps byte admission and incremental UTF-8 decoding together for child output. */
export const createUtf8OutputCollector = (maximumBytes: number) => {
  const decoders = {
    stdout: new StringDecoder('utf8'),
    stderr: new StringDecoder('utf8'),
  };
  const output = {
    stdout: '',
    stderr: '',
    usedBytes: 0,
    truncated: false,
    append(stream: 'stdout' | 'stderr', chunk: Buffer): void {
      const accepted = chunk.subarray(
        0,
        Math.max(0, maximumBytes - output.usedBytes)
      );
      output[stream] += decoders[stream].write(accepted);
      output.usedBytes += accepted.byteLength;
      if (accepted.byteLength < chunk.byteLength) output.truncated = true;
    },
    finish(stream: 'stdout' | 'stderr'): void {
      output[stream] += decoders[stream].end();
    },
  };
  return output;
};
