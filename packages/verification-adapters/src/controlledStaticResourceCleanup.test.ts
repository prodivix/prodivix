import { describe, expect, it, vi } from 'vitest';
import { cleanupControlledStaticToolchainResources } from './controlledStaticResourceCleanup';

const resourceScope = 'a'.repeat(64);
const rootless = JSON.stringify({ host: { security: { rootless: true } } });
describe('controlled static attempt resource cleanup', () => {
  it('removes only the exact labelled attempt and proves the query is empty', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(rootless)
      .mockResolvedValueOnce('abcdef123456\n012345abcdef\n')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('');
    const receipt = await cleanupControlledStaticToolchainResources({
      resourceScope,
      commands: { run },
    });
    expect(run.mock.calls).toEqual([
      [['info', '--format', 'json']],
      [
        [
          'ps',
          '--all',
          '--filter',
          `label=prodivix.controlled-static-scope=${resourceScope}`,
          '--format',
          '{{.ID}}',
        ],
      ],
      [['rm', '--force', '--ignore', 'abcdef123456']],
      [['rm', '--force', '--ignore', '012345abcdef']],
      [
        [
          'ps',
          '--all',
          '--filter',
          `label=prodivix.controlled-static-scope=${resourceScope}`,
          '--format',
          '{{.ID}}',
        ],
      ],
    ]);
    expect(receipt).toMatchObject({
      resourceScope,
      resourcesClean: true,
      removedContainerCount: 2,
    });
    expect(receipt.receiptDigest).toMatch(/^sha256-[a-f0-9]{64}$/u);
  });
  it('rejects unscoped input before any provider effect', async () => {
    const run = vi.fn();
    await expect(
      cleanupControlledStaticToolchainResources({
        resourceScope: 'all',
        commands: { run },
      })
    ).rejects.toThrow('scope');
    expect(run).not.toHaveBeenCalled();
  });
  it.each([
    'bad-container',
    'abcdef123456\nabcdef123456',
    Array(17).fill('abcdef123456').join('\n'),
  ])(
    'rejects invalid resource identifiers %s without removing containers',
    async (ids) => {
      const run = vi
        .fn()
        .mockResolvedValueOnce(rootless)
        .mockResolvedValueOnce(ids);
      await expect(
        cleanupControlledStaticToolchainResources({
          resourceScope,
          commands: { run },
        })
      ).rejects.toThrow('budget');
      expect(run).toHaveBeenCalledTimes(2);
    }
  );
  it('rejects non-rootless providers and residual containers', async () => {
    const privileged = vi
      .fn()
      .mockResolvedValue(
        JSON.stringify({ host: { security: { rootless: false } } })
      );
    await expect(
      cleanupControlledStaticToolchainResources({
        resourceScope,
        commands: { run: privileged },
      })
    ).rejects.toThrow('rootless');
    expect(privileged).toHaveBeenCalledTimes(1);
    const residual = vi
      .fn()
      .mockResolvedValueOnce(rootless)
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('abcdef123456');
    await expect(
      cleanupControlledStaticToolchainResources({
        resourceScope,
        commands: { run: residual },
      })
    ).rejects.toThrow('residual');
  });
  it.skipIf(process.platform === 'linux')(
    'requires the real Linux rootless resource owner when no SPI is supplied',
    async () => {
      await expect(
        cleanupControlledStaticToolchainResources({ resourceScope })
      ).rejects.toThrow('Linux');
    }
  );
});
