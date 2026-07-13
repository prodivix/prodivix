import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { normalizeTreeToUiGraph } from '@prodivix/pir';
import type { PIRDocument } from '@prodivix/shared/types/pir';
import { PIRRenderer } from './PIRRenderer';

const document: PIRDocument = {
  version: '1.3',
  ui: {
    graph: normalizeTreeToUiGraph({
      id: 'root',
      type: 'button',
      text: 'Open docs',
      events: {
        onClick: {
          trigger: 'onClick',
          action: 'navigate',
          params: { to: '/docs' },
        },
      },
    }),
  },
};

describe('PIRRenderer built-in action port', () => {
  it('dispatches browser-owned actions only through the explicit port', () => {
    const navigate = vi.fn();
    render(
      <PIRRenderer
        pirDoc={document}
        interactionMode="interactive"
        builtInActions={{ navigate }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open docs' }));

    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 'root',
        trigger: 'onClick',
        params: { to: '/docs' },
      })
    );
  });
});
