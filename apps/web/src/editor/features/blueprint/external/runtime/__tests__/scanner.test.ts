import { describe, expect, it } from 'vitest';
import { scanExternalModulePaths } from '@/editor/features/blueprint/external/runtime/scanner';

describe('scanExternalModulePaths', () => {
  it('discovers top-level and nested component exports', () => {
    const module = {
      Button: () => null,
      Form: Object.assign(() => null, {
        Item: () => null,
      }),
      helper: () => null,
      version: '1.0.0',
    };

    const result = scanExternalModulePaths(module, {
      includePaths: ['Form.Item'],
      excludeExports: new Set(['version']),
    });

    expect(result).toContain('Button');
    expect(result).toContain('Form');
    expect(result).toContain('Form.Item');
    expect(result).not.toContain('helper');
  });

  it('respects nested exclude exports', () => {
    const module = {
      Dropdown: Object.assign(() => null, {
        Item: () => null,
      }),
    };

    const result = scanExternalModulePaths(module, {
      excludeExports: new Set(['Item']),
    });

    expect(result).toContain('Dropdown');
    expect(result).not.toContain('Dropdown.Item');
  });

  it('keeps includePaths even when not detected by naming convention', () => {
    const module = {
      drawer: () => null,
    };

    const result = scanExternalModulePaths(module, {
      includePaths: ['drawer'],
    });

    expect(result).toContain('drawer');
  });

  it('supports include-only scan mode to avoid auto-discovery', () => {
    const module = {
      Button: () => null,
      Hidden: () => null,
      Layout: Object.assign(() => null, {
        Header: () => null,
      }),
    };

    const result = scanExternalModulePaths(module, {
      includePaths: ['Button', 'Layout.Header'],
      discoverExports: false,
    });

    expect(result).toContain('Button');
    expect(result).toContain('Layout.Header');
    expect(result).not.toContain('Hidden');
    expect(result).not.toContain('Layout');
  });
});
