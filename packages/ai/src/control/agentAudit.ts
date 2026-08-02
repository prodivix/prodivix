import { canonicalJsonText } from '@prodivix/shared/canonical';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type { AgentAuditExport, AgentControlEvent } from './agentControl.types';
import {
  AGENT_CONTROL_MAXIMUM_EVENTS,
  hasExactAgentControlKeys,
  isAgentControlInstant,
} from './agentControlValidation';
import {
  canonicalAgentControlEventOrder,
  isAgentControlEvent,
} from './agentRunFacts';

const maximumAuditExportBytes = 8_388_608;

export const verifyAgentControlEventChain = (
  events: readonly AgentControlEvent[]
): boolean => {
  if (events.length === 0 || events.length > AGENT_CONTROL_MAXIMUM_EVENTS) {
    return false;
  }
  const canonical = canonicalAgentControlEventOrder(events);
  if (canonical.some((event, index) => event !== events[index])) return false;
  const { taskId, runId } = events[0]!;
  return events.every(
    (event, index) =>
      isAgentControlEvent(event) &&
      event.taskId === taskId &&
      event.runId === runId &&
      event.sequence === events[0]!.sequence + index &&
      (index === 0 ||
        event.previousEventDigest === events[index - 1]!.eventDigest)
  );
};

export const createAgentAuditExport = (
  events: readonly AgentControlEvent[],
  exportedAt: string
): AgentAuditExport => {
  if (
    !verifyAgentControlEventChain(events) ||
    !isAgentControlInstant(exportedAt) ||
    Date.parse(exportedAt) < Date.parse(events.at(-1)!.occurredAt)
  ) {
    throw new TypeError(
      'Agent audit export identity or event chain is invalid.'
    );
  }
  const immutableEvents = Object.freeze([...events]);
  const base = {
    taskId: events[0]!.taskId,
    runId: events[0]!.runId,
    fromSequence: events[0]!.sequence,
    toSequence: events.at(-1)!.sequence,
    eventCount: events.length,
    events: immutableEvents,
    chainRootDigest: events[0]!.eventDigest,
    chainHeadDigest: events.at(-1)!.eventDigest,
    exportedAt,
  } as const;
  if (
    new TextEncoder().encode(canonicalJsonText(base)).byteLength >
    maximumAuditExportBytes
  ) {
    throw new TypeError('Agent audit export exceeds its byte limit.');
  }
  return Object.freeze({
    ...base,
    exportDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentAuditExport = (
  value: unknown
): value is AgentAuditExport => {
  if (
    !hasExactAgentControlKeys(value, [
      'taskId',
      'runId',
      'fromSequence',
      'toSequence',
      'eventCount',
      'events',
      'chainRootDigest',
      'chainHeadDigest',
      'exportedAt',
      'exportDigest',
    ]) ||
    !Array.isArray(value.events) ||
    !verifyAgentControlEventChain(
      value.events as readonly AgentControlEvent[]
    ) ||
    !Number.isSafeInteger(value.fromSequence) ||
    !Number.isSafeInteger(value.toSequence) ||
    !Number.isSafeInteger(value.eventCount) ||
    value.eventCount !== value.events.length ||
    value.fromSequence !== value.events[0]?.sequence ||
    value.toSequence !== value.events.at(-1)?.sequence ||
    value.taskId !== value.events[0]?.taskId ||
    value.runId !== value.events[0]?.runId ||
    !isAgentCanonicalDigest(value.chainRootDigest) ||
    !isAgentCanonicalDigest(value.chainHeadDigest) ||
    value.chainRootDigest !== value.events[0]?.eventDigest ||
    value.chainHeadDigest !== value.events.at(-1)?.eventDigest ||
    !isAgentControlInstant(value.exportedAt) ||
    !isAgentCanonicalDigest(value.exportDigest)
  ) {
    return false;
  }
  const { exportDigest, ...base } = value;
  return (
    new TextEncoder().encode(canonicalJsonText(base)).byteLength <=
      maximumAuditExportBytes &&
    digestAgentCanonicalValue(base) === exportDigest
  );
};
