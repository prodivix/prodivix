import { EventEmitter, once } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';

const processState = vi.hoisted(() => ({
  child: undefined as ChildProcessWithoutNullStreams | undefined,
}));
vi.mock('node:child_process', () => ({
  spawn: () => processState.child,
  execFile: (...args: unknown[]) => {
    (args.at(-1) as (error: null, stdout: string, stderr: string) => void)(
      null,
      '',
      ''
    );
  },
}));
import { createRootlessPodmanTerminalProcess } from './rootlessPodmanTerminal';

describe('rootless terminal output', () => {
  it('emits exact UTF-8 text when child streams split inside code points', async () => {
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      exitCode: null,
      signalCode: null,
      kill: vi.fn(),
    });
    processState.child = child as unknown as ChildProcessWithoutNullStreams;
    const output: { stream: 'stdout' | 'stderr'; data: string }[] = [];
    const terminal = createRootlessPodmanTerminalProcess({
      podmanCommand: 'podman',
      containerName: 'test-container',
      environment: {},
    });
    await terminal.open({
      terminalSessionId: 'terminal-1',
      size: { columns: 80, rows: 24 },
      onOutput: (event) => output.push(event),
      onExit: () => undefined,
    });
    const ended = Promise.all([
      once(child.stdout, 'end'),
      once(child.stderr, 'end'),
    ]);
    for (const byte of Buffer.from('中文🙂'))
      child.stdout.write(Buffer.from([byte]));
    for (const byte of Buffer.from('错误é'))
      child.stderr.write(Buffer.from([byte]));
    child.stdout.end();
    child.stderr.end();
    await ended;
    child.emit('close', 0);
    expect(
      output
        .filter((event) => event.stream === 'stdout')
        .map((event) => event.data)
        .join('')
    ).toBe('中文🙂');
    expect(
      output
        .filter((event) => event.stream === 'stderr')
        .map((event) => event.data)
        .join('')
    ).toBe('错误é');
    await terminal.close('execution-ended');
  });
});
