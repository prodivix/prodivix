import { mkdtemp, readdir, writeFile, open } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { digestAgentCanonicalValue } from '@prodivix/ai';
import { AgentRuntimeFileJournal } from '#src/fileJournal.js';

describe('immutable ordinary worker durable journal', () => {
  it('restores fsynced records and makes concurrent same-identity retries exact', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'prodivix-agent-journal-'));
    const first = new AgentRuntimeFileJournal(directory);
    const other = new AgentRuntimeFileJournal(directory);
    const value = {
      request: {
        operationId: 'operation.fixture',
        digest: digestAgentCanonicalValue('request'),
      },
    };
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        (index % 2 ? first : other).put('outbox', 'operation.fixture', value)
      )
    );
    expect(
      await new AgentRuntimeFileJournal(directory).read(
        'outbox',
        'operation.fixture'
      )
    ).toEqual(value);
    expect(await readdir(directory)).toHaveLength(1);
    await expect(
      first.put('outbox', 'operation.fixture', {
        request: {
          operationId: 'changed',
          digest: digestAgentCanonicalValue('other'),
        },
      })
    ).rejects.toThrow('reused');
    expect(await first.read('outbox', 'operation.fixture')).toEqual(value);
    expect(await readdir(directory)).toHaveLength(1);
  });
  it('detects stored digest corruption before returning material', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'prodivix-agent-journal-'));
    const journal = new AgentRuntimeFileJournal(directory);
    await journal.put('proposal', 'proposal.fixture', { value: 1 });
    const path = join(directory, (await readdir(directory))[0]!);
    await writeFile(
      path,
      JSON.stringify({
        kind: 'proposal',
        identity: 'proposal.fixture',
        value: { value: 2 },
        digest: digestAgentCanonicalValue('wrong'),
      }),
      'utf8'
    );
    await expect(journal.read('proposal', 'proposal.fixture')).rejects.toThrow(
      'invalid'
    );
  });
  it('rejects an oversized sparse record before allocating the body', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'prodivix-agent-journal-'));
    const journal = new AgentRuntimeFileJournal(directory);
    await journal.put('proposal', 'oversize', { value: 1 });
    const handle = await open(
      join(directory, (await readdir(directory))[0]!),
      'r+'
    );
    try {
      await handle.truncate(67_108_865);
    } finally {
      await handle.close();
    }
    await expect(journal.read('proposal', 'oversize')).rejects.toThrow(
      'exceeds'
    );
  });
});
