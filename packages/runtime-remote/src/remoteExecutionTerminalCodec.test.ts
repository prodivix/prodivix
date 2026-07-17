import { describe, expect, it } from 'vitest';
import { decodeRemoteExecutionTerminalWorkerReadResult } from './remoteExecutionTerminalWorkerCodec';

const commandPage = (command: Record<string, unknown>) => ({
  terminalSessionId: 'terminal-1',
  executionId: 'execution-1',
  acknowledgedCommandCursor: 0,
  latestCommandCursor: 1,
  hasMore: false,
  commands: [command],
});

describe('Remote Execution Terminal worker codec', () => {
  it('decodes an exact discriminated worker command', () => {
    const result = decodeRemoteExecutionTerminalWorkerReadResult(
      commandPage({
        cursor: 1,
        kind: 'input',
        terminalSessionId: 'terminal-1',
        clientSequence: 1,
        data: 'pwd\n',
      })
    );

    expect(result.commands[0]).toEqual({
      cursor: 1,
      kind: 'input',
      terminalSessionId: 'terminal-1',
      clientSequence: 1,
      data: 'pwd\n',
    });
  });

  it('rejects fields that belong to a different command variant', () => {
    expect(() =>
      decodeRemoteExecutionTerminalWorkerReadResult(
        commandPage({
          cursor: 1,
          kind: 'resize',
          terminalSessionId: 'terminal-1',
          size: { columns: 100, rows: 30 },
          data: 'must-not-be-accepted',
        })
      )
    ).toThrow('invalid shape');
  });

  it('rejects command cursor gaps and inconsistent hasMore metadata', () => {
    expect(() =>
      decodeRemoteExecutionTerminalWorkerReadResult({
        ...commandPage({
          cursor: 2,
          kind: 'close',
          terminalSessionId: 'terminal-1',
          reason: 'client-closed',
        }),
        latestCommandCursor: 2,
      })
    ).toThrow('command order');
    expect(() =>
      decodeRemoteExecutionTerminalWorkerReadResult({
        ...commandPage({
          cursor: 1,
          kind: 'close',
          terminalSessionId: 'terminal-1',
          reason: 'client-closed',
        }),
        latestCommandCursor: 2,
        hasMore: false,
      })
    ).toThrow('command order');
  });
});
