import type { RemoteExecutionTerminalClient } from './remoteExecutionTerminal.types';
import {
  decodeRemoteExecutionTerminalCloseResult,
  decodeRemoteExecutionTerminalOpenResult,
  decodeRemoteExecutionTerminalReadResult,
  decodeRemoteExecutionTerminalResizeResult,
  decodeRemoteExecutionTerminalSignalResult,
  decodeRemoteExecutionTerminalWriteResult,
} from './remoteExecutionTerminalCodec';
import type { RemoteExecutionTerminalTransport } from './remoteExecutionTerminal.types';

export type CreateRemoteExecutionTerminalClientOptions = Readonly<{
  transport: RemoteExecutionTerminalTransport;
}>;

/** Strict Remote Terminal client; transport credentials never enter Core state. */
export const createRemoteExecutionTerminalClient = (
  options: CreateRemoteExecutionTerminalClientOptions
): RemoteExecutionTerminalClient =>
  Object.freeze({
    async open(input) {
      return decodeRemoteExecutionTerminalOpenResult(
        await options.transport.send({
          operation: 'open',
          executionId: input.executionId,
          payload: Object.freeze({ size: input.size }),
        })
      );
    },
    async resume(input) {
      return decodeRemoteExecutionTerminalOpenResult(
        await options.transport.send({
          operation: 'resume',
          executionId: input.executionId,
          terminalSessionId: input.terminalSessionId,
          payload: Object.freeze({}),
        })
      );
    },
    async read(input) {
      return decodeRemoteExecutionTerminalReadResult(
        await options.transport.send({
          operation: 'read',
          executionId: input.executionId,
          terminalSessionId: input.terminalSessionId,
          accessToken: input.accessToken,
          payload: Object.freeze({
            afterCursor: input.afterCursor,
            ...(input.maximumRecords === undefined
              ? {}
              : { maximumRecords: input.maximumRecords }),
          }),
        })
      );
    },
    async write(input) {
      return decodeRemoteExecutionTerminalWriteResult(
        await options.transport.send({
          operation: 'write',
          executionId: input.executionId,
          terminalSessionId: input.terminalSessionId,
          accessToken: input.accessToken,
          payload: Object.freeze({
            data: input.data,
            clientSequence: input.clientSequence,
          }),
        })
      );
    },
    async resize(input) {
      return decodeRemoteExecutionTerminalResizeResult(
        await options.transport.send({
          operation: 'resize',
          executionId: input.executionId,
          terminalSessionId: input.terminalSessionId,
          accessToken: input.accessToken,
          payload: Object.freeze({ size: input.size }),
        })
      );
    },
    async signal(input) {
      return decodeRemoteExecutionTerminalSignalResult(
        await options.transport.send({
          operation: 'signal',
          executionId: input.executionId,
          terminalSessionId: input.terminalSessionId,
          accessToken: input.accessToken,
          payload: Object.freeze({ signal: input.signal }),
        })
      );
    },
    async close(input) {
      return decodeRemoteExecutionTerminalCloseResult(
        await options.transport.send({
          operation: 'close',
          executionId: input.executionId,
          terminalSessionId: input.terminalSessionId,
          accessToken: input.accessToken,
          payload: Object.freeze({}),
        })
      );
    },
  });
