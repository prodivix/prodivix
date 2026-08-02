import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import type { AgentJsonValue } from '../domain/agent.types';
import type { AgentControlIssue } from './agentControl.types';

export const AGENT_CONTROL_MAXIMUM_BYTES = 2_097_152;
export const AGENT_CONTROL_MAXIMUM_DEPTH = 48;
export const AGENT_CONTROL_MAXIMUM_NODES = 100_000;
export const AGENT_CONTROL_MAXIMUM_EVENTS = 10_000;

const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u;
const canonicalInstantPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const credentialLikeTextPattern =
  /(?:\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\bsk-[A-Za-z0-9_-]{8,})/iu;

export const controlIssue = (
  code: AgentControlIssue['code'],
  path: string,
  message: string
): AgentControlIssue => Object.freeze({ code, path, message, blocking: true });

export const isAgentControlIdentity = (value: unknown): value is string =>
  typeof value === 'string' &&
  identityPattern.test(value) &&
  !credentialLikeTextPattern.test(value);

export const isAgentControlInstant = (value: unknown): value is string =>
  typeof value === 'string' &&
  canonicalInstantPattern.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

export const containsAgentControlCredentialLikeText = (
  value: string
): boolean => credentialLikeTextPattern.test(value);

export const hasExactAgentControlKeys = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is Record<string, unknown> => {
  if (!isPlainObject(value)) return false;
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => allowed.has(key))
  );
};

export const cloneAgentControlJson = <T>(value: T): T =>
  JSON.parse(canonicalJsonText(value)) as T;

export const inspectAgentControlJson = (
  value: unknown,
  maximumBytes = AGENT_CONTROL_MAXIMUM_BYTES
): readonly AgentControlIssue[] => {
  const issues: AgentControlIssue[] = [];
  const ancestors = new Set<object>();
  let nodes = 0;
  const visit = (candidate: unknown, path: string, depth: number): void => {
    nodes += 1;
    if (nodes > AGENT_CONTROL_MAXIMUM_NODES) {
      issues.push(
        controlIssue(
          'AI-9001',
          '/',
          'Agent control value exceeds its node limit.'
        )
      );
      return;
    }
    if (depth > AGENT_CONTROL_MAXIMUM_DEPTH) {
      issues.push(
        controlIssue(
          'AI-9001',
          path,
          'Agent control value exceeds its depth limit.'
        )
      );
      return;
    }
    if (
      candidate === null ||
      typeof candidate === 'string' ||
      typeof candidate === 'boolean'
    ) {
      return;
    }
    if (typeof candidate === 'number') {
      if (!Number.isFinite(candidate) || !Number.isSafeInteger(candidate)) {
        issues.push(
          controlIssue(
            'AI-9001',
            path,
            'Agent control numbers must be finite safe integers.'
          )
        );
      }
      return;
    }
    if (typeof candidate !== 'object' || ancestors.has(candidate)) {
      issues.push(
        controlIssue(
          'AI-9001',
          path,
          'Agent control values must be acyclic JSON.'
        )
      );
      return;
    }
    ancestors.add(candidate);
    try {
      if (Array.isArray(candidate)) {
        const descriptors = Object.getOwnPropertyDescriptors(candidate);
        const keys = Object.getOwnPropertyNames(candidate).filter(
          (key) => key !== 'length'
        );
        if (
          keys.length !== candidate.length ||
          keys.some((key, index) => key !== String(index)) ||
          Object.getOwnPropertySymbols(candidate).length > 0
        ) {
          issues.push(
            controlIssue(
              'AI-9001',
              path,
              'Agent control arrays must be dense data arrays.'
            )
          );
          return;
        }
        keys.forEach((key) => {
          const descriptor = descriptors[key];
          if (!descriptor?.enumerable || !('value' in descriptor)) {
            issues.push(
              controlIssue(
                'AI-9001',
                `${path}/${key}`,
                'Agent control accessors are forbidden.'
              )
            );
            return;
          }
          visit(descriptor.value, `${path}/${key}`, depth + 1);
        });
        return;
      }
      if (!isPlainObject(candidate)) {
        issues.push(
          controlIssue(
            'AI-9001',
            path,
            'Agent control values must use plain objects.'
          )
        );
        return;
      }
      const descriptors = Object.getOwnPropertyDescriptors(candidate);
      for (const key of Object.getOwnPropertyNames(candidate)) {
        const child = `${path === '/' ? '' : path}/${key
          .replaceAll('~', '~0')
          .replaceAll('/', '~1')}`;
        const descriptor = descriptors[key];
        if (isUnsafeObjectKey(key)) {
          issues.push(
            controlIssue('AI-9001', child, 'Unsafe Agent control object key.')
          );
          continue;
        }
        if (!descriptor?.enumerable || !('value' in descriptor)) {
          issues.push(
            controlIssue(
              'AI-9001',
              child,
              'Agent control accessors are forbidden.'
            )
          );
          continue;
        }
        visit(descriptor.value, child, depth + 1);
      }
      if (Object.getOwnPropertySymbols(candidate).length > 0) {
        issues.push(
          controlIssue('AI-9001', path, 'Agent control keys must be strings.')
        );
      }
    } finally {
      ancestors.delete(candidate);
    }
  };

  try {
    visit(value, '/', 0);
    if (
      issues.length === 0 &&
      new TextEncoder().encode(canonicalJsonText(value)).byteLength >
        maximumBytes
    ) {
      issues.push(
        controlIssue(
          'AI-9001',
          '/',
          'Agent control value exceeds its byte limit.'
        )
      );
    }
  } catch {
    issues.push(
      controlIssue(
        'AI-9001',
        '/',
        'Agent control value cannot be safely inspected.'
      )
    );
  }
  return Object.freeze(issues);
};

export const isSafeAgentControlJson = (
  value: unknown,
  maximumBytes?: number
): value is AgentJsonValue =>
  inspectAgentControlJson(value, maximumBytes).length === 0;
