import { render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import PdxEmbed from './PdxEmbed';

describe('PdxEmbed', () => {
  it('drops runtime src and srcDoc overrides', () => {
    const hostileProps = {
      type: 'Custom',
      url: 'https://example.com/safe',
      src: 'https://example.com/hostile',
      srcDoc: '<script>parent.alert(1)</script>',
      srcdoc: '<script>parent.alert(2)</script>',
    } as unknown as ComponentProps<typeof PdxEmbed>;
    const { container } = render(<PdxEmbed {...hostileProps} />);
    const iframe = container.querySelector('iframe');

    expect(iframe).toHaveAttribute('src', 'https://example.com/safe');
    expect(iframe).not.toHaveAttribute('srcdoc');
  });
});
