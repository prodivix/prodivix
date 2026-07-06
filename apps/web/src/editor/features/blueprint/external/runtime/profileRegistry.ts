import type { ExternalLibraryProfile } from './types';

const profiles = new Map<string, ExternalLibraryProfile>();

const profileId = (profile: ExternalLibraryProfile) =>
  profile.descriptor().libraryId;

export const registerExternalLibraryProfile = (
  profile: ExternalLibraryProfile
) => {
  const id = profileId(profile);
  profiles.set(id, profile);
  return id;
};

export const unregisterExternalLibraryProfile = (libraryId: string) => {
  profiles.delete(libraryId);
};

export const getExternalLibraryProfile = (libraryId: string) =>
  profiles.get(libraryId);

export const listExternalLibraryIds = () => [...profiles.keys()];

export const resetExternalLibraryProfiles = () => {
  profiles.clear();
};
