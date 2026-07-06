import { describe, expect, it } from 'vitest';
import {
  getExternalLibraryProfile,
  listExternalLibraryIds,
  registerExternalLibraryProfile,
  resetExternalLibraryProfiles,
  unregisterExternalLibraryProfile,
} from '@/editor/features/blueprint/external/runtime/profileRegistry';
import type { ExternalLibraryProfile } from '@/editor/features/blueprint/external/runtime/types';

const createProfile = (libraryId: string): ExternalLibraryProfile => ({
  descriptor: () => ({
    libraryId,
    packageName: libraryId,
    version: '0.0.1',
    source: 'esm.sh',
    entryCandidates: [],
  }),
  toCanonicalComponents: () => [],
  toGroups: () => [],
});

describe('profileRegistry', () => {
  it('registers and resolves external library profile', () => {
    resetExternalLibraryProfiles();
    const profile = createProfile('demo-lib');
    const id = registerExternalLibraryProfile(profile);
    expect(id).toBe('demo-lib');
    expect(getExternalLibraryProfile('demo-lib')).toBe(profile);
    expect(listExternalLibraryIds()).toEqual(['demo-lib']);
  });

  it('supports unregistering profile', () => {
    resetExternalLibraryProfiles();
    registerExternalLibraryProfile(createProfile('lib-a'));
    unregisterExternalLibraryProfile('lib-a');
    expect(getExternalLibraryProfile('lib-a')).toBeUndefined();
    expect(listExternalLibraryIds()).toEqual([]);
  });
});
