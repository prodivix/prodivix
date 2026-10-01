import { describe, expect, it } from 'vitest';
import { createUtf8OutputCollector } from './utf8OutputCollector';

describe('child output UTF-8 collector', () => {
  it('preserves every multibyte split and keeps stdout and stderr decoders separate', () => {
    const text = '中文🙂é';
    const bytes = Buffer.from(text);
    for (let split = 1; split < bytes.length; split += 1) {
      const output = createUtf8OutputCollector(100);
      output.append('stdout', bytes.subarray(0, split));
      output.append('stderr', Buffer.from('错误'));
      output.append('stdout', bytes.subarray(split));
      output.finish('stdout');
      output.finish('stderr');
      expect(output.stdout).toBe(text);
      expect(output.stderr).toBe('错误');
      expect(output.usedBytes).toBe(bytes.length + Buffer.byteLength('错误'));
      expect(output.truncated).toBe(false);
    }
  });
  it('enforces the shared byte bound and flushes each child before reuse', () => {
    const output = createUtf8OutputCollector(7);
    output.append('stdout', Buffer.from('中'));
    output.finish('stdout');
    output.append('stdout', Buffer.from('文'));
    output.finish('stdout');
    output.append('stderr', Buffer.from('ab'));
    output.finish('stderr');
    expect(output.stdout).toBe('中文');
    expect(output.stderr).toBe('a');
    expect(output.usedBytes).toBe(7);
    expect(output.truncated).toBe(true);
  });
});
