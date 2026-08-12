import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import {
  AGENT_EVALUATION_PROVIDER_DEFINITIONS,
  type AgentEvaluationNativeProtocol,
} from './config';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';

export const AGENT_EVALUATION_EGRESS_LIMITS = Object.freeze({
  maximumRequestBytes: 8 * 1_024 * 1_024,
  maximumResponseBytes: 32 * 1_024 * 1_024,
  maximumTimeoutMs: 120_000,
});

export type AgentEvaluationHostResolver = (
  hostname: string
) => Promise<readonly string[]>;

export type AgentEvaluationAuthorizedEgress = Readonly<{
  hostname: string;
  approvedAddresses: readonly string[];
}>;

export type AgentEvaluationCapabilityProbeEgressMethod = 'GET' | 'POST';
export type AgentEvaluationHostedRetrievalProviderResourceEgressMethod =
  'DELETE' | 'GET' | 'POST';

export const resolveAgentEvaluationHost: AgentEvaluationHostResolver = async (
  hostname
) => {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return Object.freeze(records.map(({ address }) => address));
};

const publicIPv4 = (address: string): boolean => {
  const octets = address.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [first = 0, second = 0, third = 0] = octets;
  if (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 192 && second === 0 && third <= 2) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113)
  ) {
    return false;
  }
  return true;
};

const nonPublicIPv6 = new BlockList();
for (const [network, prefix] of [
  ['::', 96],
  ['::ffff:0.0.0.0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  nonPublicIPv6.addSubnet(network, prefix, 'ipv6');
}

const publicIPv6 = (address: string): boolean => {
  const normalized = address.toLowerCase().split('%', 1)[0] ?? '';
  try {
    return !nonPublicIPv6.check(normalized, 'ipv6');
  } catch {
    return false;
  }
};

export const isPublicAgentEvaluationAddress = (address: string): boolean => {
  const family = isIP(address);
  return family === 4
    ? publicIPv4(address)
    : family === 6
      ? publicIPv6(address)
      : false;
};

export const authorizeAgentEvaluationEgress = async (input: {
  protocolFamily: AgentEvaluationNativeProtocol;
  endpoint: string;
  requestBytes: number;
  maximumResponseBytes: number;
  timeoutMs: number;
  resolveHost?: AgentEvaluationHostResolver;
}): Promise<AgentEvaluationAuthorizedEgress> => {
  const definition =
    AGENT_EVALUATION_PROVIDER_DEFINITIONS[input.protocolFamily];
  let endpoint: URL;
  let allowedEndpoint: URL;
  try {
    endpoint = new URL(input.endpoint);
    allowedEndpoint = new URL(definition.endpoint);
  } catch {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied
    );
  }
  if (
    input.endpoint !== definition.endpoint ||
    endpoint.protocol !== 'https:' ||
    endpoint.username !== '' ||
    endpoint.password !== '' ||
    endpoint.search !== allowedEndpoint.search ||
    endpoint.hash !== '' ||
    endpoint.port !== '' ||
    !Number.isSafeInteger(input.requestBytes) ||
    input.requestBytes <= 0 ||
    input.requestBytes > AGENT_EVALUATION_EGRESS_LIMITS.maximumRequestBytes ||
    !Number.isSafeInteger(input.maximumResponseBytes) ||
    input.maximumResponseBytes <= 0 ||
    input.maximumResponseBytes >
      AGENT_EVALUATION_EGRESS_LIMITS.maximumResponseBytes ||
    !Number.isSafeInteger(input.timeoutMs) ||
    input.timeoutMs <= 0 ||
    input.timeoutMs > AGENT_EVALUATION_EGRESS_LIMITS.maximumTimeoutMs
  ) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied
    );
  }

  let addresses: readonly string[];
  try {
    addresses = await (input.resolveHost ?? resolveAgentEvaluationHost)(
      endpoint.hostname
    );
  } catch {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied
    );
  }
  if (
    addresses.length === 0 ||
    new Set(addresses).size !== addresses.length ||
    addresses.some((address) => !isPublicAgentEvaluationAddress(address))
  ) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied
    );
  }

  return Object.freeze({
    hostname: endpoint.hostname,
    approvedAddresses: Object.freeze([...addresses]),
  });
};

const providerResourceIdPattern = /^[A-Za-z0-9._~-]{1,512}$/u;

/**
 * Capability probes use the same first-party create endpoints as attempts and
 * may read only an exact provider-created OpenAI Response or Gemini
 * Interaction. The dynamic segment remains a single bounded opaque id.
 */
export const authorizeAgentEvaluationCapabilityProbeEgress = async (input: {
  protocolFamily: AgentEvaluationNativeProtocol;
  method: AgentEvaluationCapabilityProbeEgressMethod;
  endpoint: string;
  requestBytes: number;
  maximumResponseBytes: number;
  timeoutMs: number;
  resolveHost?: AgentEvaluationHostResolver;
}): Promise<AgentEvaluationAuthorizedEgress> => {
  if (input.method === 'POST') {
    if (input.protocolFamily !== 'gemini-interactions') {
      return authorizeAgentEvaluationEgress(input);
    }
    const definition =
      AGENT_EVALUATION_PROVIDER_DEFINITIONS['gemini-interactions'];
    let endpoint: URL;
    let base: URL;
    try {
      endpoint = new URL(input.endpoint);
      base = new URL(definition.endpoint);
    } catch {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied
      );
    }
    if (
      endpoint.origin !== base.origin ||
      endpoint.pathname !== '/v1/interactions' ||
      !['?alt=json', '?alt=sse'].includes(endpoint.search) ||
      endpoint.username !== '' ||
      endpoint.password !== '' ||
      endpoint.port !== '' ||
      endpoint.hash !== ''
    ) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied
      );
    }
    return authorizeAgentEvaluationEgress({
      protocolFamily: input.protocolFamily,
      endpoint: definition.endpoint,
      requestBytes: input.requestBytes,
      maximumResponseBytes: input.maximumResponseBytes,
      timeoutMs: input.timeoutMs,
      ...(input.resolveHost === undefined
        ? {}
        : { resolveHost: input.resolveHost }),
    });
  }
  const definition =
    AGENT_EVALUATION_PROVIDER_DEFINITIONS[input.protocolFamily];
  let endpoint: URL;
  let base: URL;
  try {
    endpoint = new URL(input.endpoint);
    base = new URL(definition.endpoint);
  } catch {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied
    );
  }
  const prefix =
    input.protocolFamily === 'openai-responses'
      ? '/v1/responses/'
      : input.protocolFamily === 'gemini-interactions'
        ? '/v1/interactions/'
        : undefined;
  const resourceId = prefix?.length
    ? endpoint.pathname.slice(prefix.length)
    : '';
  const expectedSearch =
    input.protocolFamily === 'gemini-interactions' ? '?alt=json' : '';
  if (
    prefix === undefined ||
    !endpoint.pathname.startsWith(prefix) ||
    !providerResourceIdPattern.test(resourceId) ||
    endpoint.origin !== base.origin ||
    endpoint.protocol !== 'https:' ||
    endpoint.username !== '' ||
    endpoint.password !== '' ||
    endpoint.port !== '' ||
    endpoint.hash !== '' ||
    endpoint.search !== expectedSearch ||
    !Number.isSafeInteger(input.requestBytes) ||
    input.requestBytes !== 1 ||
    !Number.isSafeInteger(input.maximumResponseBytes) ||
    input.maximumResponseBytes < 1 ||
    input.maximumResponseBytes >
      AGENT_EVALUATION_EGRESS_LIMITS.maximumResponseBytes ||
    !Number.isSafeInteger(input.timeoutMs) ||
    input.timeoutMs < 1 ||
    input.timeoutMs > AGENT_EVALUATION_EGRESS_LIMITS.maximumTimeoutMs
  ) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied
    );
  }
  let addresses: readonly string[];
  try {
    addresses = await (input.resolveHost ?? resolveAgentEvaluationHost)(
      endpoint.hostname
    );
  } catch {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied
    );
  }
  if (
    addresses.length === 0 ||
    new Set(addresses).size !== addresses.length ||
    addresses.some((address) => !isPublicAgentEvaluationAddress(address))
  ) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied
    );
  }
  return Object.freeze({
    hostname: endpoint.hostname,
    approvedAddresses: Object.freeze([...addresses]),
  });
};

const openAiProviderResourcePath =
  /^\/v1\/(?:files(?:\/[A-Za-z0-9._~-]{1,512})?|vector_stores(?:\/[A-Za-z0-9._~-]{1,512})?)$/u;
const geminiProviderResourcePath =
  /^\/(?:upload\/)?v1\/fileSearchStores(?:\/[a-z0-9-]{1,64}(?::uploadToFileSearchStore|\/upload\/operations\/[A-Za-z0-9._~-]{1,512})?)?$/u;

const exactProviderResourceRoute = (
  protocolFamily: AgentEvaluationNativeProtocol,
  method: AgentEvaluationHostedRetrievalProviderResourceEgressMethod,
  endpoint: URL
): boolean => {
  if (protocolFamily === 'openai-responses') {
    if (!openAiProviderResourcePath.test(endpoint.pathname)) return false;
    if (endpoint.search !== '') return false;
    if (method === 'POST') {
      return (
        endpoint.pathname === '/v1/files' ||
        endpoint.pathname === '/v1/vector_stores'
      );
    }
    if (method === 'GET') {
      return /^\/v1\/(?:files|vector_stores)\/[A-Za-z0-9._~-]{1,512}$/u.test(
        endpoint.pathname
      );
    }
    return /^\/v1\/(?:files|vector_stores)\/[A-Za-z0-9._~-]{1,512}$/u.test(
      endpoint.pathname
    );
  }
  if (
    protocolFamily !== 'gemini-interactions' ||
    !geminiProviderResourcePath.test(endpoint.pathname)
  ) {
    return false;
  }
  if (method === 'DELETE') {
    return (
      /^\/v1\/fileSearchStores\/[a-z0-9-]{1,64}$/u.test(endpoint.pathname) &&
      endpoint.search === '?force=true'
    );
  }
  if (method === 'GET') {
    if (endpoint.pathname === '/v1/fileSearchStores') {
      const keys = [...endpoint.searchParams.keys()];
      return (
        keys.length >= 1 &&
        keys.length <= 2 &&
        new Set(keys).size === keys.length &&
        endpoint.searchParams.get('pageSize') === '20' &&
        keys.every((key) => key === 'pageSize' || key === 'pageToken') &&
        (endpoint.searchParams.get('pageToken') === null ||
          /^[A-Za-z0-9._~+/=-]{1,2048}$/u.test(
            endpoint.searchParams.get('pageToken')!
          ))
      );
    }
    return (
      /^\/v1\/fileSearchStores\/[a-z0-9-]{1,64}(?:\/upload\/operations\/[A-Za-z0-9._~-]{1,512})?$/u.test(
        endpoint.pathname
      ) && endpoint.search === ''
    );
  }
  if (endpoint.pathname === '/v1/fileSearchStores') {
    return endpoint.search === '';
  }
  if (
    !/^\/upload\/v1\/fileSearchStores\/[a-z0-9-]{1,64}:uploadToFileSearchStore$/u.test(
      endpoint.pathname
    )
  ) {
    return false;
  }
  if (endpoint.search === '') return true;
  const keys = [...endpoint.searchParams.keys()];
  return (
    keys.length >= 1 &&
    keys.length <= 2 &&
    new Set(keys).size === keys.length &&
    keys.every((key) => key === 'upload_id' || key === 'upload_protocol') &&
    [...endpoint.searchParams.values()].every(
      (value) =>
        value.length >= 1 &&
        value.length <= 2_048 &&
        /^[A-Za-z0-9._~-]+$/u.test(value)
    )
  );
};

/**
 * Authorizes the exact first-party hosted-retrieval resource lifecycle. The
 * caller still binds every request to the approved addresses before sending.
 */
export const authorizeAgentEvaluationHostedRetrievalProviderResourceEgress =
  async (input: {
    protocolFamily: AgentEvaluationNativeProtocol;
    method: AgentEvaluationHostedRetrievalProviderResourceEgressMethod;
    endpoint: string;
    requestBytes: number;
    maximumResponseBytes: number;
    timeoutMs: number;
    resolveHost?: AgentEvaluationHostResolver;
  }): Promise<AgentEvaluationAuthorizedEgress> => {
    const definition =
      AGENT_EVALUATION_PROVIDER_DEFINITIONS[input.protocolFamily];
    let endpoint: URL;
    let base: URL;
    try {
      endpoint = new URL(input.endpoint);
      base = new URL(definition.endpoint);
    } catch {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied
      );
    }
    if (
      (input.protocolFamily !== 'openai-responses' &&
        input.protocolFamily !== 'gemini-interactions') ||
      endpoint.origin !== base.origin ||
      endpoint.protocol !== 'https:' ||
      endpoint.username !== '' ||
      endpoint.password !== '' ||
      endpoint.port !== '' ||
      endpoint.hash !== '' ||
      !Number.isSafeInteger(input.requestBytes) ||
      input.requestBytes < 0 ||
      input.requestBytes > AGENT_EVALUATION_EGRESS_LIMITS.maximumRequestBytes ||
      !exactProviderResourceRoute(input.protocolFamily, input.method, endpoint)
    ) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied
      );
    }
    return authorizeAgentEvaluationEgress({
      protocolFamily: input.protocolFamily,
      endpoint: definition.endpoint,
      requestBytes: Math.max(1, input.requestBytes),
      maximumResponseBytes: input.maximumResponseBytes,
      timeoutMs: input.timeoutMs,
      ...(input.resolveHost === undefined
        ? {}
        : { resolveHost: input.resolveHost }),
    });
  };
