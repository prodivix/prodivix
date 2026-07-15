import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  renderControlledSourceRegion,
  replaceControlledSourceRegion,
  scanControlledSourceRegions,
} from './controlledSource';

const unmanagedText = fc
  .string()
  .filter((value) => !value.includes('@prodivix-controlled:'));

describe('controlled source stable properties', () => {
  it('replaces a managed region while preserving every unmanaged byte', () => {
    fc.assert(
      fc.property(
        unmanagedText,
        unmanagedText,
        fc.string(),
        fc.string(),
        (prefix, suffix, currentBody, nextBody) => {
          fc.pre(!currentBody.includes('@prodivix-controlled:'));
          fc.pre(!nextBody.includes('@prodivix-controlled:'));

          const rendered = renderControlledSourceRegion({
            regionId: 'view.main',
            body: currentBody,
          });
          expect(rendered.status).toBe('ready');
          if (rendered.status !== 'ready') return;

          const replaced = replaceControlledSourceRegion({
            source: `${prefix}${rendered.source}${suffix}`,
            regionId: 'view.main',
            body: nextBody,
          });
          expect(replaced.status).toBe('ready');
          if (replaced.status !== 'ready') return;

          expect(replaced.source.startsWith(prefix)).toBe(true);
          expect(replaced.source.endsWith(suffix)).toBe(true);

          const scanned = scanControlledSourceRegions(replaced.source);
          expect(scanned.status).toBe('ready');
          if (scanned.status !== 'ready') return;
          expect(scanned.regions).toHaveLength(1);
          expect(scanned.regions[0]?.id).toBe('view.main');
        }
      )
    );
  });
});
