import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PdxGrid from './PdxGrid';

function getGridColumns(testId: string, property: string) {
  return screen.getByTestId(testId).style.getPropertyValue(property).trim();
}

describe('PdxGrid', () => {
  it('publishes the requested column counts', () => {
    render(
      <PdxGrid
        columns={3}
        columnsLarge={6}
        columnsMedium={4}
        dataAttributes={{ 'data-testid': 'grid' }}
      >
        <span>cell</span>
      </PdxGrid>
    );

    expect(getGridColumns('grid', '--pdx-grid-columns')).toBe('3');
    expect(getGridColumns('grid', '--pdx-grid-columns-medium')).toBe('4');
    expect(getGridColumns('grid', '--pdx-grid-columns-large')).toBe('6');
  });

  it('leaves the responsive counts unset when the caller omits them', () => {
    render(
      <PdxGrid columns={2} dataAttributes={{ 'data-testid': 'grid' }}>
        <span>cell</span>
      </PdxGrid>
    );

    expect(getGridColumns('grid', '--pdx-grid-columns-medium')).toBe('');
    expect(getGridColumns('grid', '--pdx-grid-columns-large')).toBe('');
  });

  it('normalises a column count that cannot produce a track', () => {
    render(
      <PdxGrid columns={0} dataAttributes={{ 'data-testid': 'zero' }}>
        <span>cell</span>
      </PdxGrid>
    );
    render(
      <PdxGrid columns={2.7} dataAttributes={{ 'data-testid': 'fractional' }}>
        <span>cell</span>
      </PdxGrid>
    );
    render(
      <PdxGrid
        columns={Number.NaN}
        dataAttributes={{ 'data-testid': 'invalid' }}
      >
        <span>cell</span>
      </PdxGrid>
    );

    expect(getGridColumns('zero', '--pdx-grid-columns')).toBe('1');
    expect(getGridColumns('fractional', '--pdx-grid-columns')).toBe('2');
    expect(getGridColumns('invalid', '--pdx-grid-columns')).toBe('1');
  });

  it('renders its children', () => {
    render(
      <PdxGrid columns={2}>
        <span>workspace</span>
        <span>router</span>
      </PdxGrid>
    );

    expect(screen.getByText('workspace')).toBeVisible();
    expect(screen.getByText('router')).toBeVisible();
  });
});
