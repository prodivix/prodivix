import { describe, expect, it } from 'vitest';

const resources = import.meta.glob<Record<string, unknown>>(
  './resources/*/*.json',
  { eager: true, import: 'default' }
);
const keys = (value: unknown, prefix = ''): string[] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    expect(typeof value, prefix).toBe('string');
    expect((value as string).trim().length, prefix).toBeGreaterThan(0);
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key)
  );
};

describe('app translation resource contract', () => {
  for (const [path, english] of Object.entries(resources).filter(([path]) =>
    path.includes('/en/')
  )) {
    const chinesePath = path.replace('/en/', '/zh-CN/');
    it(`provides every ${path.split('/').at(-1)} product key in both supported languages`, () => {
      expect(resources[chinesePath]).toBeDefined();
      expect(keys(resources[chinesePath]).sort()).toEqual(keys(english).sort());
    });
  }
});
