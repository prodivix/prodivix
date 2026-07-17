import {
  EXECUTION_TERMINAL_CLOSE_REASONS,
  EXECUTION_TERMINAL_SIGNALS,
} from '@prodivix/runtime-core';
import {
  REMOTE_EXECUTION_TERMINAL_LIMITS,
  type RemoteExecutionTerminalCommand,
  type RemoteExecutionTerminalWorkerReadResult,
} from './remoteExecutionTerminal.types';
import { decodeRemoteExecutionTerminalSize } from './remoteExecutionTerminalCodec';
import {
  decodeRemoteExecutionTerminalBoolean as boolean,
  decodeRemoteExecutionTerminalExactRecord as exactRecord,
  decodeRemoteExecutionTerminalInteger as integer,
  decodeRemoteExecutionTerminalText as text,
} from './remoteExecutionTerminalCodecSupport';

const decodeCommandBase = (record: Record<string, unknown>) =>
  Object.freeze({
    cursor: integer(record.cursor, 'Remote Terminal command cursor', 1),
    terminalSessionId: text(
      record.terminalSessionId,
      'Remote Terminal command session id'
    ),
  });

const decodeCommand = (value: unknown): RemoteExecutionTerminalCommand => {
  const discriminator = exactRecord(
    value,
    ['cursor', 'kind', 'terminalSessionId'],
    ['size', 'clientSequence', 'data', 'signal', 'reason']
  );
  if (discriminator.kind === 'open' || discriminator.kind === 'resize') {
    const record = exactRecord(value, [
      'cursor',
      'kind',
      'terminalSessionId',
      'size',
    ]);
    return Object.freeze({
      ...decodeCommandBase(record),
      kind: discriminator.kind,
      size: decodeRemoteExecutionTerminalSize(record.size),
    });
  }
  if (discriminator.kind === 'input') {
    const record = exactRecord(value, [
      'cursor',
      'kind',
      'terminalSessionId',
      'clientSequence',
      'data',
    ]);
    if (typeof record.data !== 'string')
      throw new TypeError('Remote Terminal input command is invalid.');
    return Object.freeze({
      ...decodeCommandBase(record),
      kind: 'input',
      clientSequence: integer(
        record.clientSequence,
        'Remote Terminal command client sequence',
        1
      ),
      data: record.data,
    });
  }
  if (discriminator.kind === 'signal') {
    const record = exactRecord(value, [
      'cursor',
      'kind',
      'terminalSessionId',
      'signal',
    ]);
    if (
      !EXECUTION_TERMINAL_SIGNALS.includes(
        record.signal as (typeof EXECUTION_TERMINAL_SIGNALS)[number]
      )
    )
      throw new TypeError('Remote Terminal signal command is invalid.');
    return Object.freeze({
      ...decodeCommandBase(record),
      kind: 'signal',
      signal: record.signal as 'interrupt' | 'terminate',
    });
  }
  if (discriminator.kind === 'close') {
    const record = exactRecord(value, [
      'cursor',
      'kind',
      'terminalSessionId',
      'reason',
    ]);
    if (
      !EXECUTION_TERMINAL_CLOSE_REASONS.includes(
        record.reason as (typeof EXECUTION_TERMINAL_CLOSE_REASONS)[number]
      )
    )
      throw new TypeError('Remote Terminal close command is invalid.');
    return Object.freeze({
      ...decodeCommandBase(record),
      kind: 'close',
      reason:
        record.reason as (typeof EXECUTION_TERMINAL_CLOSE_REASONS)[number],
    });
  }
  throw new TypeError('Remote Terminal command is invalid.');
};

export const decodeRemoteExecutionTerminalWorkerReadResult = (
  value: unknown
): RemoteExecutionTerminalWorkerReadResult => {
  const record = exactRecord(value, [
    'terminalSessionId',
    'executionId',
    'acknowledgedCommandCursor',
    'latestCommandCursor',
    'hasMore',
    'commands',
  ]);
  if (
    !Array.isArray(record.commands) ||
    record.commands.length >
      REMOTE_EXECUTION_TERMINAL_LIMITS.maximumWorkerReadCommands
  )
    throw new TypeError('Remote Terminal worker command page is invalid.');
  const result = Object.freeze({
    terminalSessionId: text(
      record.terminalSessionId,
      'Remote Terminal worker session id'
    ),
    executionId: text(
      record.executionId,
      'Remote Terminal worker execution id'
    ),
    acknowledgedCommandCursor: integer(
      record.acknowledgedCommandCursor,
      'Remote Terminal acknowledged command cursor'
    ),
    latestCommandCursor: integer(
      record.latestCommandCursor,
      'Remote Terminal latest command cursor'
    ),
    hasMore: boolean(record.hasMore, 'Remote Terminal worker hasMore'),
    commands: Object.freeze(record.commands.map(decodeCommand)),
  });
  if (
    result.acknowledgedCommandCursor > result.latestCommandCursor ||
    result.commands.some(
      (command, index) =>
        command.terminalSessionId !== result.terminalSessionId ||
        command.cursor !== result.acknowledgedCommandCursor + index + 1
    ) ||
    (result.hasMore
      ? (result.commands.at(-1)?.cursor ?? result.acknowledgedCommandCursor) >=
        result.latestCommandCursor
      : (result.commands.at(-1)?.cursor ?? result.acknowledgedCommandCursor) !==
        result.latestCommandCursor)
  )
    throw new TypeError('Remote Terminal worker command order is invalid.');
  return result;
};
