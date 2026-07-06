import { describe, expect, it } from 'vitest';
import { tailwind4ClassEngine } from '@/editor/features/blueprint/editor/inspector/components/classProtocol/engines/tailwind4ClassEngine';
import {
  isArbitraryTailwindToken,
  parseTailwindSuggestionQuery,
} from '@/editor/features/blueprint/editor/inspector/components/classProtocol/engines/tailwindQueryParser';

describe('tailwindQueryParser', () => {
  it('keeps colons inside brackets as a single utility segment', () => {
    const parsed = parseTailwindSuggestionQuery('hover:[mask-type:luminance]');
    expect(parsed.fixedVariants).toEqual(['hover']);
    expect(parsed.utilityDraft).toBe('[mask-type:luminance]');
  });

  it('parses trailing colon as variant draft', () => {
    const parsed = parseTailwindSuggestionQuery('sm:ho:');
    expect(parsed.fixedVariants).toEqual(['sm']);
    expect(parsed.variantDraft).toBe('ho');
    expect(parsed.utilityDraft).toBe('');
  });

  it('detects arbitrary utility tokens', () => {
    expect(isArbitraryTailwindToken('w-[12px]')).toBe(true);
    expect(isArbitraryTailwindToken('[mask-type:luminance]')).toBe(true);
    expect(isArbitraryTailwindToken('w-(--my-width)')).toBe(true);
    expect(isArbitraryTailwindToken('w-12')).toBe(false);
  });
});

describe('tailwind4ClassEngine', () => {
  it('returns arbitrary utility input as suggestion', () => {
    const suggestions = tailwind4ClassEngine.suggest({
      query: 'w-[12px]',
      tokens: [],
      limit: 6,
    });
    expect(suggestions.some((item) => item.token === 'w-[12px]')).toBe(true);
  });

  it('returns arbitrary property suggestions with variant chains', () => {
    const suggestions = tailwind4ClassEngine.suggest({
      query: 'hover:[mask-type:luminance]',
      tokens: [],
      limit: 8,
    });
    expect(
      suggestions.some((item) => item.token === 'hover:[mask-type:luminance]')
    ).toBe(true);
  });

  it('supports arbitrary variant chains when typing trailing colon', () => {
    const suggestions = tailwind4ClassEngine.suggest({
      query: '[&>*]:',
      tokens: [],
      limit: 8,
    });
    expect(suggestions.some((item) => item.token.startsWith('[&>*]:'))).toBe(
      true
    );
  });

  it('includes runtime snapshot classes from project tailwind config', () => {
    const suggestions = tailwind4ClassEngine.suggest({
      query: 'text-pri',
      tokens: [],
      limit: 12,
    });
    expect(suggestions.some((item) => item.token === 'text-primary')).toBe(
      true
    );
  });

  it('suggests arbitrary length template when query ends with utility dash', () => {
    const suggestions = tailwind4ClassEngine.suggest({
      query: 'p-',
      tokens: [],
      limit: 12,
    });
    const template = suggestions.find((item) => item.token === 'p-[<length>]');
    expect(template).toBeTruthy();
    expect(template?.hint?.type).toBe('arbitrary-length-template');
    expect(template?.hint?.prefix).toBe('p');
  });

  it('suggests color shade template for inferred color families', () => {
    const suggestions = tailwind4ClassEngine.suggest({
      query: 'border-red-',
      tokens: [],
      limit: 12,
    });
    const template = suggestions.find((item) => item.kind === 'hint');
    expect(template?.hint?.type).toBe('color-shade-template');
    expect(template?.hint?.prefix).toBe('border-red');
    expect(template?.insertText).toMatch(/^border-red-\d+$/);
    expect(
      suggestions.some(
        (item) =>
          item.kind === 'hint' &&
          item.hint?.type === 'arbitrary-length-template'
      )
    ).toBe(false);
  });

  it('returns no suggestions for invalid color shade literals with unit suffix', () => {
    const suggestions = tailwind4ClassEngine.suggest({
      query: 'border-red-500p',
      tokens: [],
      limit: 12,
    });
    expect(suggestions).toEqual([]);
  });

  it('normalizes unit literals to bracket arbitrary syntax', () => {
    const suggestions = tailwind4ClassEngine.suggest({
      query: 'p-12px',
      tokens: [],
      limit: 12,
    });
    expect(suggestions[0]?.token).toBe('p-[12px]');
  });

  it('keeps intent-preserving arbitrary suggestion before inferred scale token', () => {
    const suggestions = tailwind4ClassEngine.suggest({
      query: 'p-12px',
      tokens: [],
      limit: 12,
    });
    expect(suggestions[0]?.token).toBe('p-[12px]');
    expect(suggestions.some((item) => item.token === 'p-3')).toBe(true);
    const arbitraryIndex = suggestions.findIndex(
      (item) => item.token === 'p-[12px]'
    );
    const scaleIndex = suggestions.findIndex((item) => item.token === 'p-3');
    expect(arbitraryIndex).toBeGreaterThanOrEqual(0);
    expect(scaleIndex).toBeGreaterThan(arbitraryIndex);
  });

  it('keeps suggestions visible for every step while typing p-[12px]', () => {
    const steps = ['p-', 'p-[', 'p-[1', 'p-[12', 'p-[12p', 'p-[12px'];
    steps.forEach((query) => {
      const suggestions = tailwind4ClassEngine.suggest({
        query,
        tokens: [],
        limit: 12,
      });
      expect(suggestions.length).toBeGreaterThan(0);
    });
  });

  it('suggests all matching units from p-[1 and p-[12p drafts', () => {
    const fromNumeric = tailwind4ClassEngine.suggest({
      query: 'p-[1',
      tokens: [],
      limit: 64,
    });
    expect(fromNumeric.some((item) => item.token === 'p-[1px]')).toBe(true);
    expect(fromNumeric.some((item) => item.token === 'p-[1pt]')).toBe(true);

    const fromUnitPrefix = tailwind4ClassEngine.suggest({
      query: 'p-[12p',
      tokens: [],
      limit: 12,
    });
    expect(fromUnitPrefix.some((item) => item.token === 'p-[12px]')).toBe(true);
    expect(fromUnitPrefix.some((item) => item.token === 'p-[12pt]')).toBe(true);
    expect(fromUnitPrefix.some((item) => item.token === 'p-[12pc]')).toBe(true);
  });

  it('keeps p-12p and p-[12p unit suggestions aligned', () => {
    const normalized = tailwind4ClassEngine
      .suggest({
        query: 'p-12p',
        tokens: [],
        limit: 12,
      })
      .map((item) => item.token);
    const bracketed = tailwind4ClassEngine
      .suggest({
        query: 'p-[12p',
        tokens: [],
        limit: 12,
      })
      .map((item) => item.token);
    expect(normalized).toEqual(bracketed);
  });

  it('falls back to fuzzy hyphen-insensitive suggestions when strict match misses', () => {
    const suggestions = tailwind4ClassEngine.suggest({
      query: 'justifyc',
      tokens: [],
      limit: 10,
    });
    expect(suggestions.some((item) => item.token === 'justify-center')).toBe(
      true
    );
  });

  it('falls back to abbreviation suggestions when fuzzy match misses', () => {
    const suggestions = tailwind4ClassEngine.suggest({
      query: 'jc',
      tokens: [],
      limit: 10,
    });
    expect(suggestions.some((item) => item.token === 'justify-center')).toBe(
      true
    );
  });
});
