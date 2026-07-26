import { describe, expect, it } from 'vitest';
import { resolveBlueprintPirEntrySurfaceMode } from './BlueprintPirEntrySurface';

describe('resolveBlueprintPirEntrySurfaceMode', () => {
  it.each([
    ['pir-page', 'viewport'],
    ['pir-layout', 'viewport'],
    ['pir-component', 'intrinsic'],
  ] as const)('maps %s to the %s entry surface', (documentType, expected) => {
    expect(resolveBlueprintPirEntrySurfaceMode(documentType)).toBe(expected);
  });
});
