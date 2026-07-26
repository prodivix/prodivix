import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import PdxEmbed from './PdxEmbed';

describe('PdxEmbed', () => {
  it('drops runtime src and srcDoc overrides', () => {
    const hostileProps = {
      type: 'Custom',
      url: 'https://example.com/safe',
      title: 'Embedded',
      src: 'https://example.com/hostile',
      srcDoc: '<script>parent.alert(1)</script>',
      srcdoc: '<script>parent.alert(2)</script>',
    } as unknown as ComponentProps<typeof PdxEmbed>;
    render(<PdxEmbed {...hostileProps} />);
    const frame = screen.getByTitle('Embedded');

    expect(frame).toHaveAttribute('src', 'https://example.com/safe');
    expect(frame).not.toHaveAttribute('srcdoc');
  });

  it('always emits a sandbox and falls back to a blank document', () => {
    render(<PdxEmbed type="YouTube" url="not-a-url" title="Embedded" />);
    const frame = screen.getByTitle('Embedded');

    expect(frame).toHaveAttribute('src', 'about:blank');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin');
  });
});
