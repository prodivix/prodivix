import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PdxSpacer from './PdxSpacer';

describe('PdxSpacer', () => {
  it('stays out of the accessibility tree', () => {
    render(
      <div>
        <PdxSpacer dataAttributes={{ 'data-testid': 'spacer' }} />
        <span>Canvas</span>
      </div>
    );

    expect(screen.getByTestId('spacer')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Canvas')).toBeVisible();
  });

  it('never contributes content of its own', () => {
    render(<PdxSpacer dataAttributes={{ 'data-testid': 'spacer' }} flexible />);

    expect(screen.getByTestId('spacer')).toBeEmptyDOMElement();
  });
});
