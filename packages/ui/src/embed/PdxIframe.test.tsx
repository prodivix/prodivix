import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import PdxIframe from './PdxIframe';

const readSandboxTokens = (frame: HTMLElement) =>
  (frame.getAttribute('sandbox') ?? '').split(/\s+/u).filter(Boolean);

const renderIframe = (props: Record<string, unknown>) => {
  render(
    <PdxIframe
      title="Framed"
      {...(props as unknown as ComponentProps<typeof PdxIframe>)}
    />
  );
  return screen.getByTitle('Framed');
};

describe('PdxIframe', () => {
  it('ignores srcDoc without an explicit inline-document opt-in', () => {
    const frame = renderIframe({
      src: 'https://example.com/page',
      srcDoc: '<script>parent.postMessage("owned", "*")</script>',
    });

    expect(frame).not.toHaveAttribute('srcdoc');
    expect(frame).toHaveAttribute('src', 'https://example.com/page');
  });

  it('sandboxes an opted-in inline document away from the embedder origin', () => {
    const frame = renderIframe({
      srcDoc: '<p>inline</p>',
      allowInlineDocument: true,
      sandbox: 'allow-scripts allow-same-origin',
    });

    expect(frame).toHaveAttribute('srcdoc', '<p>inline</p>');
    expect(readSandboxTokens(frame)).toEqual(['allow-scripts']);
  });

  it('always emits a sandbox attribute', () => {
    const frame = renderIframe({ src: 'https://example.com/page' });

    expect(frame).toHaveAttribute('sandbox');
    expect(readSandboxTokens(frame).length).toBeGreaterThan(0);
  });

  it('keeps same-origin access away from an embedder-origin src', () => {
    const frame = renderIframe({
      src: `${globalThis.location.origin}/editor`,
      sandbox: 'allow-scripts allow-same-origin',
    });

    expect(readSandboxTokens(frame)).not.toContain('allow-same-origin');
  });

  it('rejects a non-http src instead of loading it', () => {
    const frame = renderIframe({ src: 'javascript:parent.alert(1)' });

    expect(frame).toHaveAttribute('src', 'about:blank');
  });

  it('keeps same-origin access for a cross-origin frame', () => {
    const frame = renderIframe({ src: 'https://example.com/page' });

    expect(readSandboxTokens(frame)).toContain('allow-same-origin');
  });

  it('drops pass-through props that would replace the framed document', () => {
    const frame = renderIframe({
      src: 'https://example.com/page',
      srcdoc: '<script>parent.alert(1)</script>',
      dangerouslySetInnerHTML: { __html: '<script>parent.alert(2)</script>' },
    });

    expect(frame).not.toHaveAttribute('srcdoc');
    expect(frame).toHaveAttribute('src', 'https://example.com/page');
  });
});
