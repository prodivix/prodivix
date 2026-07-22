import { describe, expect, it } from 'vitest';
import {
  createInitialPersistedLibrary,
  normalizeExternalLibrariesValue,
} from '@/editor/features/resources/workspaceExternalLibraries';

describe('workspace external library dependencies', () => {
  it('normalizes persisted dependencies without runtime loading state', () => {
    const value = normalizeExternalLibrariesValue({
      componentLibraryIds: ['antd'],
      iconLibraryIds: [],
      activeLibraries: [
        {
          id: 'antd',
          scope: 'component',
          version: '5.28.0',
        },
      ],
      mode: 'locked',
      metadataCache: {
        antd: {
          description: 'volatile',
          license: 'volatile-license',
          updatedAt: Date.now(),
        },
      },
    });

    expect(value.activeLibraries).toEqual([
      { id: 'antd', scope: 'component', version: '5.28.0' },
    ]);
    expect(value).not.toHaveProperty('metadataCache');
  });

  it('creates a versioned dependency declaration for a new library', () => {
    expect(
      createInitialPersistedLibrary(
        '@example/components',
        'component',
        ['2.0.0', '1.5.0'],
        'locked',
        undefined,
        'MIT'
      )
    ).toEqual({
      id: '@example/components',
      scope: 'component',
      version: '2.0.0',
      license: 'MIT',
    });
  });
});
