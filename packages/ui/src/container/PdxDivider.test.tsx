import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PdxDivider from './PdxDivider';

describe('PdxDivider', () => {
  it('is a horizontal separator by default', () => {
    render(<PdxDivider />);

    const separator = screen.getByRole('separator');
    expect(separator).toHaveAttribute('aria-orientation', 'horizontal');
    expect(separator).not.toHaveAccessibleName();
  });

  it('reports a vertical orientation', () => {
    render(<PdxDivider orientation="Vertical" />);

    expect(screen.getByRole('separator')).toHaveAttribute(
      'aria-orientation',
      'vertical'
    );
  });

  // `separator` takes presentational children, so the label only reaches
  // assistive technology through the name computation.
  it('names itself from its label', () => {
    render(<PdxDivider label="Archived" />);

    expect(screen.getByRole('separator', { name: 'Archived' })).toBeVisible();
  });

  it('keeps the label in either orientation', () => {
    render(<PdxDivider label="Archived" orientation="Vertical" />);

    const separator = screen.getByRole('separator', { name: 'Archived' });
    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    expect(screen.getByText('Archived')).toBeVisible();
  });
});
