import { mkdir, open, link, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import { digestAgentCanonicalValue } from '@prodivix/ai';
import {
  createWorkspaceOutboxEntry,
  type WorkspaceOutboxEntry,
  type WorkspaceOutboxStore,
} from '@prodivix/workspace-sync';

export type AgentRuntimeOutboxStore = Pick<
  WorkspaceOutboxStore,
  'enqueue' | 'get'
>;

/** Immutable, fsynced records use content-bound IDs; retries never replace an exact request. */
export class AgentRuntimeFileJournal {
  readonly directory: string;
  constructor(directory: string) {
    this.directory = resolve(directory);
  }

  async read<T>(kind: string, identity: string): Promise<T | undefined> {
    const path = this.path(kind, identity);
    let handle;
    try {
      handle = await open(path, 'r');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    let source: Buffer;
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 67_108_864)
        throw new Error('Agent runtime durable record exceeds its limit.');
      const chunks: Buffer[] = [];
      let bytes = 0;
      for (;;) {
        const chunk = Buffer.allocUnsafe(65_536);
        const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
        if (bytesRead === 0) break;
        bytes += bytesRead;
        if (bytes > 67_108_864)
          throw new Error('Agent runtime durable record exceeds its limit.');
        chunks.push(chunk.subarray(0, bytesRead));
      }
      source = Buffer.concat(chunks, bytes);
    } finally {
      await handle.close();
    }
    const value: unknown = JSON.parse(
      new TextDecoder('utf8', { fatal: true }).decode(source)
    );
    if (
      !isPlainObject(value) ||
      Object.keys(value).some(
        (key) => !['kind', 'identity', 'value', 'digest'].includes(key)
      ) ||
      value.kind !== kind ||
      value.identity !== identity ||
      value.digest !==
        digestAgentCanonicalValue({ kind, identity, value: value.value })
    )
      throw new Error('Agent runtime durable record is invalid.');
    return value.value as T;
  }

  async put<T>(kind: string, identity: string, value: T): Promise<T> {
    const path = this.path(kind, identity);
    await mkdir(this.directory, { recursive: true });
    const base = { kind, identity, value };
    const bytes = canonicalJsonText({
      ...base,
      digest: digestAgentCanonicalValue(base),
    });
    if (Buffer.byteLength(bytes) > 67_108_864)
      throw new Error('Agent runtime durable record exceeds its limit.');
    const temporary = join(this.directory, `.pending.${randomUUID()}`);
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(bytes, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        await link(temporary, path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      // Flush the published file's metadata as well as its contents. POSIX also needs the directory entry.
      const published = await open(path, 'r+');
      try {
        await published.sync();
      } finally {
        await published.close();
      }
      if (process.platform !== 'win32') {
        const directory = await open(this.directory, 'r');
        try {
          await directory.sync();
        } finally {
          await directory.close();
        }
      }
      const existing = await this.read<T>(kind, identity);
      if (
        digestAgentCanonicalValue(existing) !== digestAgentCanonicalValue(value)
      )
        throw new Error(
          'Agent runtime durable identity was reused with different material.'
        );
      return existing!;
    } finally {
      await unlink(temporary).catch(() => {});
    }
  }

  outbox(): AgentRuntimeOutboxStore {
    const validate = (entry: WorkspaceOutboxEntry): WorkspaceOutboxEntry => {
      const expected = createWorkspaceOutboxEntry({
        baseSnapshot: entry.baseSnapshot,
        operation: entry.operation,
        now: entry.createdAt,
      });
      if (
        !expected.ok ||
        entry.entryKind !== 'operation' ||
        entry.state.kind !== 'queued' ||
        entry.id !== expected.entry.id ||
        entry.workspaceId !== expected.entry.workspaceId ||
        digestAgentCanonicalValue(entry.request) !==
          digestAgentCanonicalValue(expected.entry.request)
      )
        throw new Error(
          'Agent runtime Outbox request lost its exact owner binding.'
        );
      return entry;
    };
    return {
      enqueue: async (entry) => {
        await this.put('outbox', entry.id, validate(entry));
      },
      get: async (id) => {
        const entry = await this.read<WorkspaceOutboxEntry>('outbox', id);
        return entry ? validate(entry) : null;
      },
    };
  }

  private path(kind: string, identity: string): string {
    if (!/^[a-z][a-z-]{0,31}$/u.test(kind) || !identity)
      throw new Error('Agent runtime durable identity is invalid.');
    return join(
      this.directory,
      `${kind}.${digestAgentCanonicalValue(identity).slice(7)}.json`
    );
  }
}
