import { describe, expect, it } from 'vitest';
import { resolveZipFilePayload } from '@/editor/features/export/exportZip';

describe('exportZip', () => {
  it('uses already-verified binary bytes without text coercion', () => {
    const payload = resolveZipFilePayload({
      path: 'public/images/logo.png',
      content: '// placeholder',
      binaryContent: new Uint8Array([0, 255, 1]),
    });
    expect(payload).toBeInstanceOf(Uint8Array);
    expect(payload).toEqual(new Uint8Array([0, 255, 1]));
  });

  it('uses text content when no binary materialization exists', () => {
    expect(
      resolveZipFilePayload({
        path: 'src/App.tsx',
        content: 'export default function App() {}',
      })
    ).toBe('export default function App() {}');
  });
});
