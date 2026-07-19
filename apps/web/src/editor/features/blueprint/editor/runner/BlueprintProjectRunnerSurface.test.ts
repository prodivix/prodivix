import { describe, expect, it } from 'vitest';
import type { BlueprintProjectRunnerState } from './useBlueprintProjectRunner';
import {
  isBlueprintProjectRunnerSnapshotStale,
  resolveProjectPreviewUrl,
} from './BlueprintProjectRunnerSurface';

const state = (
  overrides: Partial<BlueprintProjectRunnerState> = {}
): BlueprintProjectRunnerState => ({
  status: 'compiling',
  provider: 'browser',
  target: 'react-vite',
  diagnostics: [],
  ...overrides,
});

describe('Blueprint Project Runner surface model', () => {
  it('marks only a retained preview from an older authoring snapshot as stale', () => {
    expect(
      isBlueprintProjectRunnerSnapshotStale(
        state({
          previewUrl: 'https://preview.example.test/',
          activeSnapshotId: 'snapshot-1',
          authoringSnapshotId: 'snapshot-2',
        })
      )
    ).toBe(true);
    expect(
      isBlueprintProjectRunnerSnapshotStale(
        state({
          previewUrl: 'https://preview.example.test/',
          activeSnapshotId: 'snapshot-2',
          authoringSnapshotId: 'snapshot-2',
        })
      )
    ).toBe(false);
    expect(
      isBlueprintProjectRunnerSnapshotStale(
        state({
          activeSnapshotId: 'snapshot-1',
          authoringSnapshotId: 'snapshot-2',
        })
      )
    ).toBe(false);
  });

  it('keeps preview navigation on the selected route without inherited query or hash', () => {
    expect(
      resolveProjectPreviewUrl(
        'https://preview.example.test/old?token=drop#fragment',
        '/catalog'
      )
    ).toBe('https://preview.example.test/catalog');
  });
});
