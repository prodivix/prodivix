import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readBoundedRemoteRegionalRecoveryFile } from './regionalRecoveryOperatorJob';

const temporaryDirectories: string[] = [];

const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'prodivix-regional-dr-'));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe('regional recovery operator bounded file input', () => {
  it('reads the exact bytes from one bounded regular file', async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, 'proof.json');
    await writeFile(path, '{"proof":true}', { encoding: 'utf8' });

    const value = await readBoundedRemoteRegionalRecoveryFile(path, 64);

    expect(new TextDecoder().decode(value)).toBe('{"proof":true}');
    value.fill(0);
  });

  it('rejects empty, oversized and non-regular inputs', async () => {
    const directory = await temporaryDirectory();
    const emptyPath = join(directory, 'empty');
    const oversizedPath = join(directory, 'oversized');
    await writeFile(emptyPath, '');
    await writeFile(oversizedPath, '12345');

    await expect(
      readBoundedRemoteRegionalRecoveryFile(emptyPath, 4)
    ).rejects.toThrow('input file is invalid');
    await expect(
      readBoundedRemoteRegionalRecoveryFile(oversizedPath, 4)
    ).rejects.toThrow('input file is invalid');
    await expect(
      readBoundedRemoteRegionalRecoveryFile(directory, 64)
    ).rejects.toThrow('input file is invalid');
  });
});
