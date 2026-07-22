import {
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
  type JsonValue,
  type PluginDiagnostic,
} from '@prodivix/plugin-contracts';
import {
  decodeRuntimeEnvelopeV1,
  encodeRuntimeEnvelopeV1,
} from '#protocol/codec/runtimeEnvelopeCodec';
import type { ProtocolJsonLimits } from '#protocol/codec/strictJsonCodec';
import type { ProtocolContractRegistry } from '#protocol/contracts/protocolContractRegistry';
import type {
  ProtocolChannel,
  ProtocolContractIdentity,
} from '#protocol/contracts/protocolContract';
import type { RuntimeEnvelopeV1 } from '#protocol/generated/runtimeEnvelope.generated';
import {
  protocolFailure,
  protocolSuccess,
  type ProtocolResult,
} from '#protocol/result';

export type ProtocolRequest = Readonly<{
  channel: ProtocolChannel;
  method: string;
  contractVersion: string;
  messageId: string;
  payload: JsonValue;
}>;

export type ProtocolEvent = ProtocolRequest;

export type ProtocolRequestHandler = (
  request: ProtocolRequest,
  signal: AbortSignal
) => Promise<ProtocolResult<JsonValue>>;

export type ProtocolEventHandler = (
  event: ProtocolEvent
) => void | Promise<void>;

export type ProtocolEndpointOptions = Readonly<{
  contracts: ProtocolContractRegistry;
  sendText(text: string): void;
  messagePrefix: string;
  codecLimits?: Partial<ProtocolJsonLimits>;
  defaultRequestTimeoutMs?: number;
  maxMessagesPerSession?: number;
  maxClosedRequestIds?: number;
  onRequest?: ProtocolRequestHandler;
  onEvent?: ProtocolEventHandler;
  onDiagnostic?: (diagnostic: PluginDiagnostic) => void;
  onFatal?: (diagnostic: PluginDiagnostic) => void;
}>;

export type ProtocolSendRequest = Readonly<{
  channel: ProtocolChannel;
  method: string;
  contractVersion: string;
  payload: JsonValue;
  timeoutMs?: number;
  signal?: AbortSignal;
}>;

export type ProtocolSendEvent = Omit<
  ProtocolSendRequest,
  'timeoutMs' | 'signal'
>;

export type ProtocolEndpoint = Readonly<{
  receive(source: unknown): Promise<ProtocolResult<void>>;
  request(input: ProtocolSendRequest): Promise<ProtocolResult<JsonValue>>;
  sendEvent(input: ProtocolSendEvent): ProtocolResult<void>;
  close(reasonCode?: string): void;
  isClosed(): boolean;
}>;

type PendingRequest = {
  identity: Omit<ProtocolContractIdentity, 'kind'>;
  resolve(result: ProtocolResult<JsonValue>): void;
  timeoutId: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  abortListener?: () => void;
};

type InboundRequest = {
  controller: AbortController;
};

type ClosedRequestReason = 'completed' | 'canceled' | 'timed-out';

const normalizePositiveInteger = (
  value: number | undefined,
  fallback: number
) =>
  Number.isSafeInteger(value) && (value ?? 0) > 0
    ? (value as number)
    : fallback;

const normalizePrefix = (value: string): string => {
  const normalized = value.replaceAll(/[^A-Za-z0-9._:-]/g, '-').slice(0, 96);
  return normalized.length > 0 ? normalized : 'endpoint';
};

const requestMeta = (input: {
  channel: ProtocolChannel;
  method: string;
  contractVersion: string;
  messageId?: string;
  replyTo?: string;
}) => ({
  protocolChannel: input.channel,
  protocolMethod: input.method,
  protocolKind: 'request',
  contractVersion: input.contractVersion,
  messageId: input.messageId,
  replyTo: input.replyTo,
});

const safeReasonCode = (reason: unknown): string =>
  typeof reason === 'string' && reason.length > 0
    ? reason.slice(0, 96)
    : 'request-canceled';

const asRequest = (envelope: RuntimeEnvelopeV1): ProtocolRequest => ({
  channel: envelope.channel,
  method: envelope.method,
  contractVersion: envelope.contractVersion,
  messageId: envelope.messageId,
  payload: envelope.payload,
});

export const createProtocolEndpoint = (
  options: ProtocolEndpointOptions
): ProtocolEndpoint => {
  const messagePrefix = normalizePrefix(options.messagePrefix);
  const defaultTimeoutMs = normalizePositiveInteger(
    options.defaultRequestTimeoutMs,
    5_000
  );
  const maxMessages = normalizePositiveInteger(
    options.maxMessagesPerSession,
    65_536
  );
  const maxClosedRequestIds = normalizePositiveInteger(
    options.maxClosedRequestIds,
    4_096
  );
  const pending = new Map<string, PendingRequest>();
  const inbound = new Map<string, InboundRequest>();
  const closedRequests = new Map<string, ClosedRequestReason>();
  const seenInboundMessageIds = new Set<string>();
  let outboundSequence = 0;
  let inboundSequence = 0;
  let closed = false;

  const sessionClosedDiagnostic = (reasonCode = 'protocol-session-closed') =>
    createPluginDiagnostic(
      PLUGIN_DIAGNOSTIC_CODES.PROTOCOL_SESSION_CLOSED,
      'Protocol session is closed and cannot process more messages.',
      { reasonCode }
    );

  const rememberClosedRequest = (
    requestId: string,
    reason: ClosedRequestReason
  ): void => {
    closedRequests.delete(requestId);
    closedRequests.set(requestId, reason);
    while (closedRequests.size > maxClosedRequestIds) {
      const oldest = closedRequests.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      closedRequests.delete(oldest);
    }
  };

  const settlePending = (
    requestId: string,
    result: ProtocolResult<JsonValue>,
    reason: ClosedRequestReason
  ): void => {
    const entry = pending.get(requestId);
    if (!entry) return;
    pending.delete(requestId);
    clearTimeout(entry.timeoutId);
    if (entry.signal && entry.abortListener) {
      entry.signal.removeEventListener('abort', entry.abortListener);
    }
    rememberClosedRequest(requestId, reason);
    entry.resolve(result);
  };

  const closeInternal = (diagnostic: PluginDiagnostic): void => {
    if (closed) return;
    closed = true;
    for (const request of inbound.values()) {
      request.controller.abort('protocol-session-closed');
    }
    inbound.clear();
    for (const requestId of [...pending.keys()]) {
      settlePending(requestId, protocolFailure([diagnostic]), 'canceled');
    }
    options.onFatal?.(diagnostic);
  };

  const fatal = (diagnostic: PluginDiagnostic): ProtocolResult<never> => {
    closeInternal(diagnostic);
    return protocolFailure([diagnostic]);
  };

  const requireContract = (identity: ProtocolContractIdentity) =>
    options.contracts.require(identity);

  const nextEnvelope = (
    identity: ProtocolContractIdentity,
    payload: JsonValue,
    replyTo?: string
  ): ProtocolResult<RuntimeEnvelopeV1> => {
    if (closed) {
      return protocolFailure([sessionClosedDiagnostic()]);
    }
    const contract = requireContract(identity);
    if (!contract.ok) return contract;
    const validated = contract.value.validate(payload);
    if (!validated.ok) return validated;
    const sequence = outboundSequence + 1;
    const envelope: RuntimeEnvelopeV1 = {
      protocol: 'prodivix.plugin-runtime',
      protocolVersion: '1.0',
      kind: identity.kind,
      channel: identity.channel,
      method: identity.method,
      contractVersion: identity.contractVersion,
      messageId: `${messagePrefix}.${sequence}`,
      sequence,
      payload: validated.value,
      ...(replyTo ? { replyTo } : {}),
    };
    return protocolSuccess(envelope);
  };

  const sendEnvelope = (envelope: RuntimeEnvelopeV1): ProtocolResult<void> => {
    const encoded = encodeRuntimeEnvelopeV1(envelope, options.codecLimits);
    if (!encoded.ok) return encoded;
    try {
      options.sendText(encoded.value);
      outboundSequence = envelope.sequence;
      return protocolSuccess(undefined);
    } catch {
      const diagnostic = sessionClosedDiagnostic(
        'protocol-transport-send-failed'
      );
      closeInternal(diagnostic);
      return protocolFailure([diagnostic]);
    }
  };

  const sendEvent = (input: ProtocolSendEvent): ProtocolResult<void> => {
    const envelope = nextEnvelope({ ...input, kind: 'event' }, input.payload);
    if (!envelope.ok) return envelope;
    return sendEnvelope(envelope.value);
  };

  const bestEffortCancel = (requestId: string, reasonCode: string): void => {
    if (closed) return;
    sendEvent({
      channel: 'control',
      method: 'runtime/cancel',
      contractVersion: '1.0',
      payload: { requestId, reasonCode },
    });
  };

  const request = (
    input: ProtocolSendRequest
  ): Promise<ProtocolResult<JsonValue>> => {
    if (closed) {
      return Promise.resolve(protocolFailure([sessionClosedDiagnostic()]));
    }
    const envelope = nextEnvelope({ ...input, kind: 'request' }, input.payload);
    if (!envelope.ok) return Promise.resolve(envelope);
    if (input.signal?.aborted) {
      return Promise.resolve(
        protocolFailure([
          sessionClosedDiagnostic(safeReasonCode(input.signal.reason)),
        ])
      );
    }

    const requestId = envelope.value.messageId;
    return new Promise((resolve) => {
      const timeoutMs = normalizePositiveInteger(
        input.timeoutMs,
        defaultTimeoutMs
      );
      const timeoutId = setTimeout(() => {
        const diagnostic = createPluginDiagnostic(
          PLUGIN_DIAGNOSTIC_CODES.PROTOCOL_REQUEST_TIMEOUT,
          `Protocol request exceeded the ${timeoutMs} ms timeout.`,
          {
            ...requestMeta({ ...input, messageId: requestId }),
            limit: timeoutMs,
          }
        );
        bestEffortCancel(requestId, 'request-timeout');
        settlePending(requestId, protocolFailure([diagnostic]), 'timed-out');
      }, timeoutMs);
      const entry: PendingRequest = {
        identity: {
          channel: input.channel,
          method: input.method,
          contractVersion: input.contractVersion,
        },
        resolve,
        timeoutId,
        signal: input.signal,
      };
      if (input.signal) {
        entry.abortListener = () => {
          const reasonCode = safeReasonCode(input.signal?.reason);
          bestEffortCancel(requestId, reasonCode);
          settlePending(
            requestId,
            protocolFailure([sessionClosedDiagnostic(reasonCode)]),
            'canceled'
          );
        };
        input.signal.addEventListener('abort', entry.abortListener, {
          once: true,
        });
      }
      pending.set(requestId, entry);
      const sent = sendEnvelope(envelope.value);
      if (!sent.ok) {
        settlePending(requestId, sent, 'canceled');
      }
    });
  };

  const validateInboundSequence = (
    envelope: RuntimeEnvelopeV1
  ): ProtocolResult<void> => {
    const expected = inboundSequence + 1;
    if (envelope.sequence !== expected) {
      return fatal(
        createPluginDiagnostic(
          PLUGIN_DIAGNOSTIC_CODES.PROTOCOL_SEQUENCE_VIOLATION,
          `Protocol sequence ${envelope.sequence} does not match expected sequence ${expected}.`,
          {
            expectedSequence: expected,
            actual: envelope.sequence,
            messageId: envelope.messageId,
          }
        )
      );
    }
    if (seenInboundMessageIds.has(envelope.messageId)) {
      return fatal(
        createPluginDiagnostic(
          PLUGIN_DIAGNOSTIC_CODES.PROTOCOL_SEQUENCE_VIOLATION,
          'Protocol message id was reused within the current session.',
          { messageId: envelope.messageId, actual: envelope.sequence }
        )
      );
    }
    if (seenInboundMessageIds.size >= maxMessages) {
      return fatal(
        createPluginDiagnostic(
          PLUGIN_DIAGNOSTIC_CODES.PROTOCOL_SEQUENCE_VIOLATION,
          'Protocol session exhausted its bounded message identity budget.',
          { limit: maxMessages, actual: seenInboundMessageIds.size + 1 }
        )
      );
    }
    inboundSequence = envelope.sequence;
    seenInboundMessageIds.add(envelope.messageId);
    return protocolSuccess(undefined);
  };

  const handleResponse = (
    envelope: RuntimeEnvelopeV1
  ): ProtocolResult<void> => {
    const replyTo = envelope.replyTo!;
    const entry = pending.get(replyTo);
    if (!entry) {
      const closedReason = closedRequests.get(replyTo);
      if (closedReason === 'canceled' || closedReason === 'timed-out') {
        const diagnostic = createPluginDiagnostic(
          PLUGIN_DIAGNOSTIC_CODES.LATE_PROTOCOL_RESPONSE,
          'Late protocol response was discarded after its request closed.',
          {
            replyTo,
            messageId: envelope.messageId,
            reasonCode: closedReason,
          }
        );
        options.onDiagnostic?.(diagnostic);
        return protocolSuccess(undefined, [diagnostic]);
      }
      return fatal(
        createPluginDiagnostic(
          PLUGIN_DIAGNOSTIC_CODES.PROTOCOL_CORRELATION_VIOLATION,
          'Protocol response does not reference a pending request.',
          { replyTo, messageId: envelope.messageId }
        )
      );
    }
    if (
      entry.identity.channel !== envelope.channel ||
      entry.identity.method !== envelope.method ||
      entry.identity.contractVersion !== envelope.contractVersion
    ) {
      return fatal(
        createPluginDiagnostic(
          PLUGIN_DIAGNOSTIC_CODES.PROTOCOL_CORRELATION_VIOLATION,
          'Protocol response identity does not match its pending request.',
          {
            replyTo,
            messageId: envelope.messageId,
            protocolChannel: envelope.channel,
            protocolMethod: envelope.method,
            contractVersion: envelope.contractVersion,
          }
        )
      );
    }
    settlePending(replyTo, protocolSuccess(envelope.payload), 'completed');
    return protocolSuccess(undefined);
  };

  const handleCancelEvent = (envelope: RuntimeEnvelopeV1): void => {
    if (
      envelope.channel !== 'control' ||
      envelope.method !== 'runtime/cancel' ||
      typeof envelope.payload !== 'object' ||
      envelope.payload === null ||
      Array.isArray(envelope.payload)
    ) {
      return;
    }
    const requestId = envelope.payload.requestId;
    const reasonCode = envelope.payload.reasonCode;
    if (typeof requestId !== 'string') return;
    inbound
      .get(requestId)
      ?.controller.abort(
        typeof reasonCode === 'string' ? reasonCode : 'remote-cancel'
      );
  };

  const handleRequest = async (
    envelope: RuntimeEnvelopeV1
  ): Promise<ProtocolResult<void>> => {
    if (!options.onRequest) {
      return fatal(
        createPluginDiagnostic(
          PLUGIN_DIAGNOSTIC_CODES.UNKNOWN_PROTOCOL_CONTRACT,
          'Protocol endpoint has no request handler for a registered request.',
          {
            protocolChannel: envelope.channel,
            protocolMethod: envelope.method,
            contractVersion: envelope.contractVersion,
          }
        )
      );
    }
    const active: InboundRequest = { controller: new AbortController() };
    inbound.set(envelope.messageId, active);
    let handled: ProtocolResult<JsonValue>;
    try {
      handled = await options.onRequest(
        asRequest(envelope),
        active.controller.signal
      );
    } catch {
      handled = protocolFailure([
        createPluginDiagnostic(
          PLUGIN_DIAGNOSTIC_CODES.PROTOCOL_SESSION_CLOSED,
          'Protocol request handler failed unexpectedly.',
          {
            protocolChannel: envelope.channel,
            protocolMethod: envelope.method,
            messageId: envelope.messageId,
          }
        ),
      ]);
    } finally {
      inbound.delete(envelope.messageId);
    }
    if (active.controller.signal.aborted || closed) {
      return protocolSuccess(undefined);
    }
    if (!handled.ok) return fatal(handled.diagnostics[0]);
    const response = nextEnvelope(
      {
        channel: envelope.channel,
        method: envelope.method,
        contractVersion: envelope.contractVersion,
        kind: 'response',
      },
      handled.value,
      envelope.messageId
    );
    if (!response.ok) return fatal(response.diagnostics[0]);
    return sendEnvelope(response.value);
  };

  const receive = async (source: unknown): Promise<ProtocolResult<void>> => {
    if (closed) return protocolFailure([sessionClosedDiagnostic()]);
    const decoded = decodeRuntimeEnvelopeV1(source, options.codecLimits);
    if (!decoded.ok) return fatal(decoded.diagnostics[0]);
    const envelope = decoded.value;
    const sequenced = validateInboundSequence(envelope);
    if (!sequenced.ok) return sequenced;
    const contract = requireContract({
      channel: envelope.channel,
      method: envelope.method,
      contractVersion: envelope.contractVersion,
      kind: envelope.kind,
    });
    if (!contract.ok) return fatal(contract.diagnostics[0]);
    const payload = contract.value.validate(envelope.payload);
    if (!payload.ok) return fatal(payload.diagnostics[0]);

    if (envelope.kind === 'response') return handleResponse(envelope);
    if (envelope.kind === 'request') return handleRequest(envelope);

    handleCancelEvent(envelope);
    try {
      await options.onEvent?.(asRequest(envelope));
      return protocolSuccess(undefined);
    } catch {
      return fatal(
        createPluginDiagnostic(
          PLUGIN_DIAGNOSTIC_CODES.PROTOCOL_SESSION_CLOSED,
          'Protocol event handler failed unexpectedly.',
          {
            protocolChannel: envelope.channel,
            protocolMethod: envelope.method,
            messageId: envelope.messageId,
          }
        )
      );
    }
  };

  return Object.freeze({
    receive,
    request,
    sendEvent,
    close: (reasonCode = 'protocol-session-closed') =>
      closeInternal(sessionClosedDiagnostic(reasonCode)),
    isClosed: () => closed,
  });
};
