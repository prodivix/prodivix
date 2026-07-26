import { describe, expect, it } from 'vitest';
import {
  BLANK_FRAME_SRC,
  filterFramePassThroughProps,
  resolveFrameSandbox,
  resolveSafeFrameSrc,
} from './embedFrameSafety';

const tokensOf = (sandbox: string) => sandbox.split(/\s+/u).filter(Boolean);

describe('resolveFrameSandbox', () => {
  it('never combines allow-scripts with allow-same-origin for an inline document', () => {
    const sandbox = resolveFrameSandbox({
      requested: 'allow-scripts allow-same-origin allow-forms',
      src: BLANK_FRAME_SRC,
      inlineDocument: true,
    });

    expect(tokensOf(sandbox)).toEqual(['allow-forms', 'allow-scripts']);
  });

  it('returns a token set even when nothing is requested', () => {
    const sandbox = resolveFrameSandbox({ src: 'https://example.com/page' });

    expect(tokensOf(sandbox)).toContain('allow-scripts');
  });

  it('drops unknown and unconditional top-navigation tokens', () => {
    const sandbox = resolveFrameSandbox({
      requested: 'allow-top-navigation allow-everything ALLOW-FORMS',
      src: 'https://example.com/page',
    });

    expect(tokensOf(sandbox)).toEqual(['allow-forms']);
  });

  it('keeps an explicitly empty request maximally restrictive', () => {
    expect(
      resolveFrameSandbox({ requested: '   ', src: 'https://example.com/page' })
    ).not.toBe('');
    expect(
      resolveFrameSandbox({
        requested: 'allow-nothing-known',
        src: 'https://example.com/page',
      })
    ).toBe('');
  });
});

describe('resolveSafeFrameSrc', () => {
  it('falls back to a blank document instead of the embedder document', () => {
    expect(resolveSafeFrameSrc('Custom', undefined)).toBe(BLANK_FRAME_SRC);
    expect(resolveSafeFrameSrc('Custom', '')).toBe(BLANK_FRAME_SRC);
    expect(resolveSafeFrameSrc('Custom', 'javascript:alert(1)')).toBe(
      BLANK_FRAME_SRC
    );
    expect(
      resolveSafeFrameSrc('YouTube', 'https://example.com/not-youtube')
    ).toBe(BLANK_FRAME_SRC);
  });

  it('keeps a resolvable provider url', () => {
    expect(resolveSafeFrameSrc('YouTube', 'https://youtu.be/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ'
    );
  });
});

describe('filterFramePassThroughProps', () => {
  it('removes document-replacing and sandbox-overriding props in any casing', () => {
    expect(
      filterFramePassThroughProps({
        allow: 'fullscreen',
        children: 'x',
        dangerouslySetInnerHTML: { __html: 'x' },
        sandbox: 'allow-scripts allow-same-origin',
        src: 'https://attacker.example',
        srcDoc: '<script></script>',
        srcdoc: '<script></script>',
      })
    ).toEqual({ allow: 'fullscreen' });
  });
});
