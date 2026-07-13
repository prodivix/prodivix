import { describe, expect, it } from 'vitest';
import {
  getVisibleTextMetrics,
  normalizeBaseURL,
  parseSafeRichText,
  resolveSafeEmbedUrl,
  sanitizeSvgMarkup,
  splitSseFrames,
  stripJsonFence,
  truncate,
} from '../index';

describe('safety utilities', () => {
  it('normalizes URLs and navigation targets with a stable allowlist', () => {
    expect(normalizeBaseURL('https://api.example.com///')).toBe(
      'https://api.example.com'
    );
  });

  it('resolves safe embed URLs without executing arbitrary protocols', () => {
    expect(resolveSafeEmbedUrl('YouTube', 'https://youtu.be/abcdefghijk')).toBe(
      'https://www.youtube.com/embed/abcdefghijk'
    );
    expect(resolveSafeEmbedUrl('Vimeo', 'https://vimeo.com/123456')).toBe(
      'https://player.vimeo.com/video/123456'
    );
    expect(resolveSafeEmbedUrl('Custom', 'javascript:alert(1)')).toBe('');
  });

  it('parses safe inline rich text and strips unsafe markup', () => {
    expect(
      parseSafeRichText(
        '<strong style="color: red; background-image: url(https://x)">Hi</strong><script>alert(1)</script>'
      )
    ).toEqual([
      {
        tagName: 'strong',
        style: { color: 'red' },
        children: ['Hi'],
      },
    ]);
  });

  it('sanitizes SVG markup into a safe preview source', () => {
    const safe = sanitizeSvgMarkup(
      '<svg viewBox="0 0 10 10" onclick="alert(1)"><script>alert(1)</script><path d="M0 0L10 10" stroke="red" /></svg>'
    );

    expect(safe).toContain('<svg');
    expect(safe).toContain('<path');
    expect(safe).not.toContain('onclick');
    expect(safe).not.toContain('script');
  });

  it('normalizes text-like inputs without regular-expression backtracking', () => {
    expect(getVisibleTextMetrics('<b>Hello</b>   world')).toEqual({
      text: 'Hello world',
      characterCount: 11,
      wordCount: 2,
    });
    expect(stripJsonFence('```json\n{"ok":true}\n```')).toBe('{"ok":true}');
    expect(splitSseFrames('data: one\n\ndata: two')).toEqual({
      frames: ['data: one'],
      remainder: 'data: two',
    });
    expect(truncate('hello', 2)).toBe('..');
  });
});
