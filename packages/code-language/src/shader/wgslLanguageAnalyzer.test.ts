import { describe, expect, it } from 'vitest';
import { analyzeWgslSource } from './wgslLanguageAnalyzer';

describe('WGSL variable declarations', () => {
  it('includes constant references in workgroup and resource attribute expressions', () => {
    const source =
      'const SIZE = 4; const GROUP = 0; @group(GROUP) @binding(0) var<uniform> data: f32; @compute @workgroup_size(SIZE, SIZE, 1) fn main() {}';
    const analysis = analyzeWgslSource(source);
    expect(
      analysis.symbols.find(({ name }) => name === 'SIZE')?.occurrences
    ).toHaveLength(3);
    expect(
      analysis.symbols.find(({ name }) => name === 'GROUP')?.occurrences
    ).toHaveLength(2);
    expect(
      analysis.symbols.some(
        ({ name }) => name === 'compute' || name === 'workgroup_size'
      )
    ).toBe(false);
  });
  it('skips the address-space template before reading a var name', () => {
    const analysis = analyzeWgslSource(
      [
        'struct Params { scale: f32, }',
        '@group(0) @binding(0) var<uniform> params: Params;',
        'fn read_scale() -> f32 { return params.scale; }',
      ].join('\n')
    );

    const params = analysis.symbols.find((symbol) => symbol.name === 'params');
    expect(params).toMatchObject({ category: 'resource', moduleLevel: true });
    expect(params?.occurrences).toHaveLength(2);
    expect(analysis.symbols.some((symbol) => symbol.name === 'uniform')).toBe(
      false
    );
  });
});
