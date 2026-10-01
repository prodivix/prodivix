import { constants } from 'node:fs';
import { mkdir, open, rename, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { digestVerificationValue } from '@prodivix/verification';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { driverDigest, exactDriverRecord } from '#src/g3/contract.js';

export type DriverJournalRecord = Readonly<{
  requestDigest: string;
  state: 'executing' | 'clean' | 'uncertain';
  resourceScopes: readonly string[];
  browserActive: boolean;
  completedAt?: string;
}>;
/** Stores commitments and cleanup time only; inputs and credentials stay ephemeral. */
export class DriverJournal {
  constructor(private readonly root: string) {}
  private async path(runId: string): Promise<string> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const directory = await lstat(this.root);
    if (!directory.isDirectory() || directory.isSymbolicLink())
      throw new Error('G3 journal directory is invalid.');
    return resolve(
      this.root,
      `${digestVerificationValue({ runId }).slice(7)}.json`
    );
  }
  async read(runId: string): Promise<DriverJournalRecord | undefined> {
    const path = await this.path(runId);
    let handle;
    try {
      handle = await open(
        path,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
      );
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return undefined;
      throw error;
    }
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 2 * 1024 * 1024)
        throw new Error('G3 journal record is invalid.');
      const source = await handle.readFile({ encoding: 'utf8' });
      const value = exactDriverRecord(
        JSON.parse(source),
        ['requestDigest', 'state', 'resourceScopes', 'browserActive'],
        ['completedAt']
      );
      if (typeof value.browserActive !== 'boolean')
        throw new Error('G3 Browser resource authority is invalid.');
      if (
        !Array.isArray(value.resourceScopes) ||
        value.resourceScopes.length > 20000 ||
        value.resourceScopes.some(
          (scope) => typeof scope !== 'string' || !/^[a-f0-9]{64}$/u.test(scope)
        ) ||
        new Set(value.resourceScopes).size !== value.resourceScopes.length
      )
        throw new Error('G3 journal resource coordinates are invalid.');
      if (
        !['executing', 'clean', 'uncertain'].includes(String(value.state)) ||
        (value.completedAt !== undefined &&
          (typeof value.completedAt !== 'string' ||
            new Date(value.completedAt).toISOString() !== value.completedAt)) ||
        (value.state === 'clean' && value.completedAt === undefined)
      )
        throw new Error('G3 journal record is invalid.');
      return {
        requestDigest: driverDigest(value.requestDigest),
        state: value.state as DriverJournalRecord['state'],
        resourceScopes: value.resourceScopes as string[],
        browserActive: value.browserActive,
        ...(value.completedAt
          ? { completedAt: value.completedAt as string }
          : {}),
      };
    } finally {
      await handle.close();
    }
  }
  async write(
    runId: string,
    value: DriverJournalRecord,
    create = false
  ): Promise<void> {
    const path = await this.path(runId);
    const target = create ? path : `${path}.tmp`;
    const handle = await open(
      target,
      constants.O_WRONLY |
        constants.O_CREAT |
        (create ? constants.O_EXCL : constants.O_TRUNC) |
        (constants.O_NOFOLLOW ?? 0),
      0o600
    );
    try {
      await handle.writeFile(canonicalJsonText(value), 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (!create) await rename(target, path);
  }
}
