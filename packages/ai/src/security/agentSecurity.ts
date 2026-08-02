import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import {
  cloneAgentControlJson,
  hasExactAgentControlKeys,
  isAgentControlIdentity,
  isAgentControlInstant,
  inspectAgentControlJson,
} from '../control/agentControlValidation';
import type { AgentContextPack } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type {
  AgentContextSecurityInspection,
  AgentDnsResolutionReceipt,
  AgentEgressAuthorization,
  AgentEgressPolicyInput,
  AgentEgressRequest,
  AgentSecretCallbackLease,
  AgentSecretCallbackUseReceipt,
  AgentSecurityFinding,
} from './agentSecurity.types';

const finding = (
  code: AgentSecurityFinding['code'],
  path: string,
  category: AgentSecurityFinding['category'],
  message: string,
  blocking = true
): AgentSecurityFinding =>
  Object.freeze({ code, path, category, message, blocking });

const sortFindings = (
  values: readonly AgentSecurityFinding[]
): readonly AgentSecurityFinding[] => {
  const unique = new Map<string, AgentSecurityFinding>();
  for (const value of values) {
    unique.set(
      `${value.code}\u0000${value.path}\u0000${value.category}\u0000${value.message}\u0000${value.blocking}`,
      value
    );
  }
  return Object.freeze(
    [...unique.values()].sort(
      (left, right) =>
        compareUnicodeCodePoints(left.path, right.path) ||
        compareUnicodeCodePoints(left.category, right.category) ||
        compareUnicodeCodePoints(left.message, right.message)
    )
  );
};

const instructionSignalPatterns = Object.freeze([
  /ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions/iu,
  /system\s+prompt/iu,
  /(?:self|auto)[-\s]?approv/iu,
  /reveal\s+(?:the\s+)?secret/iu,
  /bypass\s+(?:the\s+)?(?:policy|permission|approval)/iu,
  /execute\s+(?:this\s+)?(?:instruction|command)/iu,
]);

/** Signals are diagnostic only; authority is enforced from typed boundaries. */
export const classifyAgentUntrustedInstructionSignals = (
  text: string,
  path = '/'
): readonly AgentSecurityFinding[] =>
  sortFindings(
    instructionSignalPatterns.flatMap((pattern, index) =>
      pattern.test(text)
        ? [
            finding(
              'AI-7002',
              path,
              'prompt-injection-signal',
              `Untrusted content matched instruction-like signal ${index + 1}.`,
              false
            ),
          ]
        : []
    )
  );

export const inspectAgentContextSecurity = (
  context: AgentContextPack
): AgentContextSecurityInspection => {
  const findings: AgentSecurityFinding[] = [];
  if (!isAgentCanonicalDigest(context.manifestDigest)) {
    findings.push(
      finding(
        'AI-9001',
        '/manifestDigest',
        'unsafe-artifact',
        'Context Pack manifest digest is invalid.'
      )
    );
  }
  for (const [index, item] of context.items.entries()) {
    const path = `/items/${index}`;
    if (
      (item.authority === 'external-untrusted' ||
        item.authority === 'user-provided') &&
      item.instructionBoundary !== 'data-only'
    ) {
      findings.push(
        finding(
          'AI-7002',
          `${path}/instructionBoundary`,
          'authority-confusion',
          'Untrusted Context must remain data-only.'
        )
      );
    }
    if (
      item.authority === 'external-untrusted' &&
      item.source.kind !== 'external'
    ) {
      findings.push(
        finding(
          'AI-7002',
          `${path}/source`,
          'authority-confusion',
          'External Context cannot claim Canonical Workspace source authority.'
        )
      );
    }
    const possibleContent = (item as unknown as { content?: unknown }).content;
    if (typeof possibleContent === 'string') {
      findings.push(
        ...classifyAgentUntrustedInstructionSignals(
          possibleContent,
          `${path}/content`
        )
      );
    }
  }
  const canonical = sortFindings(findings);
  return Object.freeze({
    contextPackDigest: context.manifestDigest,
    findings: canonical,
    safe: canonical.every(({ blocking }) => !blocking),
  });
};

const maximumCanaryCount = 256;
const maximumCanaryBytes = 65_536;
const maximumArtifactScanNodes = 100_000;
const maximumArtifactScanDepth = 48;
const maximumArtifactScanTextUnits = 8_388_608;
const maximumSecretCallbackLeaseMs = 300_000;
const maximumSecretRefsPerLease = 32;

type CanaryPattern = Readonly<{ signatures: readonly string[] }>;

const bytesToHex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const bytesToBase64 = (bytes: Uint8Array): string => {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let encoded = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const chunk = (first << 16) | (second << 8) | third;
    encoded += alphabet[(chunk >>> 18) & 63];
    encoded += alphabet[(chunk >>> 12) & 63];
    encoded += index + 1 < bytes.length ? alphabet[(chunk >>> 6) & 63] : '=';
    encoded += index + 2 < bytes.length ? alphabet[chunk & 63] : '=';
  }
  return encoded;
};

const normalizeCanaryPatterns = (
  canaries: readonly string[],
  label: string
): readonly CanaryPattern[] => {
  const encoder = new TextEncoder();
  const unique = [...new Set(canaries)];
  if (
    unique.length === 0 ||
    unique.length > maximumCanaryCount ||
    unique.some((entry) => typeof entry !== 'string' || entry.length < 8)
  ) {
    throw new TypeError(
      `${label} canaries must contain 1-${maximumCanaryCount} explicit values of at least 8 characters.`
    );
  }
  const encodedCanaries = unique.map((entry) => ({
    bytes: encoder.encode(entry),
    entry,
  }));
  if (
    encodedCanaries.reduce((total, { bytes }) => total + bytes.byteLength, 0) >
    maximumCanaryBytes
  ) {
    throw new TypeError(`${label} canaries exceed the bounded byte envelope.`);
  }
  return Object.freeze(
    encodedCanaries.map(({ bytes, entry }) => {
      const base64 = bytesToBase64(bytes);
      let uriEncoded = entry;
      try {
        uriEncoded = encodeURIComponent(entry);
      } catch {
        // The fully percent-encoded UTF-8 form below remains deterministic.
      }
      const signatures = new Set([
        entry,
        uriEncoded,
        [...bytes]
          .map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`)
          .join(''),
        bytesToHex(bytes),
        bytesToHex(bytes).toUpperCase(),
        base64,
        base64.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, ''),
      ]);
      return Object.freeze({ signatures: Object.freeze([...signatures]) });
    })
  );
};

const scanArtifactForCanaryPatterns = (
  value: unknown,
  patterns: readonly CanaryPattern[],
  matchedFinding: (path: string) => AgentSecurityFinding
): readonly AgentSecurityFinding[] => {
  const findings: AgentSecurityFinding[] = [];
  const ancestors = new Set<object>();
  let nodes = 0;
  let textUnits = 0;
  let unsafe = false;
  const rejectUnsafe = (): void => {
    if (unsafe) return;
    unsafe = true;
    findings.push(
      finding(
        'AI-9001',
        '/',
        'unsafe-artifact',
        'Artifact canary scan exceeded its safe inspection envelope.'
      )
    );
  };
  const scanText = (text: string, path: string): boolean => {
    textUnits += text.length;
    if (textUnits > maximumArtifactScanTextUnits) {
      rejectUnsafe();
      return false;
    }
    let matched = false;
    for (const pattern of patterns) {
      if (pattern.signatures.some((signature) => text.includes(signature))) {
        findings.push(matchedFinding(path));
        matched = true;
      }
    }
    return matched;
  };
  const visit = (candidate: unknown, path: string, depth: number): void => {
    if (unsafe) return;
    nodes += 1;
    if (nodes > maximumArtifactScanNodes || depth > maximumArtifactScanDepth) {
      rejectUnsafe();
      return;
    }
    if (typeof candidate === 'string') {
      scanText(candidate, path);
      return;
    }
    if (candidate instanceof Uint8Array) {
      scanText(
        new TextDecoder('utf-8', { fatal: false }).decode(candidate),
        path
      );
      scanText(bytesToHex(candidate), path);
      scanText(bytesToBase64(candidate), path);
      return;
    }
    if (
      candidate === null ||
      typeof candidate === 'boolean' ||
      (typeof candidate === 'number' && Number.isFinite(candidate))
    ) {
      return;
    }
    if (typeof candidate !== 'object' || ancestors.has(candidate)) {
      rejectUnsafe();
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
          rejectUnsafe();
          return;
        }
        for (const key of keys) {
          const descriptor = descriptors[key];
          if (!descriptor?.enumerable || !('value' in descriptor)) {
            rejectUnsafe();
            return;
          }
          visit(descriptor.value, `${path}/${key}`, depth + 1);
        }
        return;
      }
      if (!isPlainObject(candidate)) {
        rejectUnsafe();
        return;
      }
      const descriptors = Object.getOwnPropertyDescriptors(candidate);
      if (Object.getOwnPropertySymbols(candidate).length > 0) {
        rejectUnsafe();
        return;
      }
      const keys = Object.getOwnPropertyNames(candidate).sort(
        compareUnicodeCodePoints
      );
      for (const [index, key] of keys.entries()) {
        const descriptor = descriptors[key];
        const fieldPath = `${path === '/' ? '' : path}/fields/${index}`;
        scanText(key, `${fieldPath}/key`);
        if (!descriptor?.enumerable || !('value' in descriptor)) {
          rejectUnsafe();
          return;
        }
        visit(descriptor.value, `${fieldPath}/value`, depth + 1);
      }
    } finally {
      ancestors.delete(candidate);
    }
  };
  try {
    visit(value, '/', 0);
  } catch {
    rejectUnsafe();
  }
  return sortFindings(findings);
};

/** Scans JSON/text/bytes without including the matched value in diagnostics. */
export const scanAgentArtifactForSecretCanaries = (
  value: unknown,
  canaries: readonly string[]
): readonly AgentSecurityFinding[] =>
  scanArtifactForCanaryPatterns(
    value,
    normalizeCanaryPatterns(canaries, 'Secret'),
    (path) =>
      finding(
        'AI-7003',
        path,
        'secret-canary',
        'A registered Secret canary reached a prohibited artifact.'
      )
  );

export const scanAgentArtifactForProtectedHoldoutLeak = (
  artifact: unknown,
  protectedHoldoutCanaries: readonly string[]
): readonly AgentSecurityFinding[] =>
  scanArtifactForCanaryPatterns(
    artifact,
    normalizeCanaryPatterns(protectedHoldoutCanaries, 'Protected holdout'),
    (path) =>
      finding(
        'AI-8011',
        path,
        'holdout-leak',
        'Protected holdout body material reached a public artifact.'
      )
  );

const parseIPv4 = (value: string): readonly number[] | undefined => {
  const parts = value.split('.');
  if (parts.length !== 4) return undefined;
  const numbers = parts.map(Number);
  return numbers.every(
    (entry, index) =>
      Number.isInteger(entry) &&
      entry >= 0 &&
      entry <= 255 &&
      String(entry) === parts[index]
  )
    ? numbers
    : undefined;
};

const parseIPv6 = (value: string): readonly number[] | undefined => {
  if (value.includes('%') || value.split('::').length > 2) return undefined;
  const [headText, tailText] = value.toLowerCase().split('::');
  const parseSide = (side: string | undefined): number[] | undefined => {
    if (!side) return [];
    const rawParts = side.split(':');
    const values: number[] = [];
    for (const [index, part] of rawParts.entries()) {
      if (part.includes('.')) {
        if (index !== rawParts.length - 1) return undefined;
        const ipv4 = parseIPv4(part);
        if (!ipv4) return undefined;
        values.push(ipv4[0]! * 256 + ipv4[1]!, ipv4[2]! * 256 + ipv4[3]!);
      } else if (!/^[a-f0-9]{1,4}$/u.test(part)) {
        return undefined;
      } else {
        values.push(Number.parseInt(part, 16));
      }
    }
    return values;
  };
  const head = parseSide(headText);
  const tail = parseSide(tailText);
  if (!head || !tail) return undefined;
  if (!value.includes('::')) {
    return head.length === 8 ? head : undefined;
  }
  const omitted = 8 - head.length - tail.length;
  return omitted >= 1
    ? [...head, ...Array.from({ length: omitted }, () => 0), ...tail]
    : undefined;
};

const isPublicAddress = (address: string): boolean => {
  const ipv4 = parseIPv4(address);
  if (ipv4) {
    const [a, b] = ipv4;
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b! >= 64 && b! <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b! >= 16 && b! <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 88) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51) ||
      (a === 203 && b === 0 && ipv4[2] === 113) ||
      a! >= 224
    );
  }
  const ipv6 = parseIPv6(address);
  if (!ipv6) return false;
  const ipv4Mapped =
    ipv6.slice(0, 5).every((part) => part === 0) && ipv6[5] === 0xffff;
  if (ipv4Mapped) {
    const high = ipv6[6]!;
    const low = ipv6[7]!;
    return isPublicAddress(
      `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`
    );
  }
  const first = ipv6[0]!;
  const second = ipv6[1]!;
  return (
    first >= 0x2000 &&
    first <= 0x3fff &&
    first !== 0x2002 &&
    !(
      first === 0x2001 &&
      (second === 0 ||
        second === 2 ||
        second === 0x10 ||
        second === 0x20 ||
        second === 0x0db8)
    )
  );
};

const hostMatches = (host: string, ruleHost: string): boolean =>
  ruleHost.startsWith('*.')
    ? host.endsWith(ruleHost.slice(1)) && host !== ruleHost.slice(2)
    : host === ruleHost;

export const createAgentDnsResolutionReceipt = (
  input: Omit<AgentDnsResolutionReceipt, 'receiptDigest'>
): AgentDnsResolutionReceipt => {
  if (
    !input.hostname.trim() ||
    !isAgentCanonicalDigest(input.resolverPolicyDigest) ||
    !isAgentControlInstant(input.resolvedAt) ||
    !isAgentControlInstant(input.expiresAt) ||
    Date.parse(input.expiresAt) <= Date.parse(input.resolvedAt)
  ) {
    throw new TypeError(
      'DNS resolution receipt identity or expiry is invalid.'
    );
  }
  const resolvedAddresses = Object.freeze(
    [...input.resolvedAddresses].sort(compareUnicodeCodePoints)
  );
  if (
    resolvedAddresses.length === 0 ||
    new Set(resolvedAddresses).size !== resolvedAddresses.length ||
    resolvedAddresses.some(
      (address) => !parseIPv4(address) && !parseIPv6(address)
    )
  ) {
    throw new TypeError('DNS resolution receipt requires unique addresses.');
  }
  const base = Object.freeze({ ...input, resolvedAddresses });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

const origin = (value: URL): string =>
  `${value.protocol}//${value.hostname.toLowerCase()}${value.port ? `:${value.port}` : ''}`;

export const authorizeAgentEgress = (
  request: AgentEgressRequest,
  policy: AgentEgressPolicyInput
): AgentEgressAuthorization => {
  const findings: AgentSecurityFinding[] = [];
  const boundedCounts = [
    request.requestBytes,
    request.expectedMaximumResponseBytes,
    request.timeoutMs,
  ];
  if (
    !isAgentControlIdentity(request.requestId) ||
    !isAgentControlIdentity(request.purpose) ||
    !['GET', 'HEAD', 'POST'].includes(request.method) ||
    !['browser', 'server', 'native', 'sandbox'].includes(request.runtimeZone) ||
    boundedCounts.some((value) => !Number.isSafeInteger(value) || value <= 0) ||
    !Number.isSafeInteger(policy.maximumTimeoutMs) ||
    policy.maximumTimeoutMs <= 0 ||
    request.timeoutMs > policy.maximumTimeoutMs ||
    !policy.allowedRuntimeZones.includes(request.runtimeZone) ||
    new Set(policy.allowedRuntimeZones).size !==
      policy.allowedRuntimeZones.length ||
    new Set(policy.allowedPurposes).size !== policy.allowedPurposes.length ||
    !isAgentCanonicalDigest(policy.resolverPolicyDigest)
  ) {
    findings.push(
      finding(
        'AI-7004',
        '/request',
        'network-policy',
        'Egress identity, runtime zone, timeout, or byte envelope is invalid.'
      )
    );
  }
  let url: URL | undefined;
  try {
    url = new URL(request.url);
  } catch {
    findings.push(
      finding('AI-7004', '/url', 'network-policy', 'Egress URL is invalid.')
    );
  }
  const receipt = request.dnsReceipt;
  const { receiptDigest: _receiptDigest, ...receiptBase } = receipt;
  if (
    digestAgentCanonicalValue(receiptBase) !== receipt.receiptDigest ||
    receipt.resolverPolicyDigest !== policy.resolverPolicyDigest ||
    !isAgentControlInstant(request.requestedAt) ||
    Date.parse(receipt.resolvedAt) > Date.parse(request.requestedAt) ||
    Date.parse(receipt.expiresAt) <= Date.parse(request.requestedAt)
  ) {
    findings.push(
      finding(
        'AI-7004',
        '/dnsReceipt',
        'network-policy',
        'DNS resolution is stale, drifted, or from an untrusted resolver policy.'
      )
    );
  }
  if (
    url &&
    (url.protocol !== 'https:' ||
      (url.port !== '' && url.port !== '443') ||
      Boolean(url.username) ||
      Boolean(url.password) ||
      url.hostname.toLowerCase() !== receipt.hostname.toLowerCase())
  ) {
    findings.push(
      finding(
        'AI-7004',
        '/url',
        'network-policy',
        'Egress requires credential-free HTTPS and exact resolved hostname binding.'
      )
    );
  }
  if (receipt.resolvedAddresses.some((address) => !isPublicAddress(address))) {
    findings.push(
      finding(
        'AI-7004',
        '/dnsReceipt/resolvedAddresses',
        'network-policy',
        'Private, loopback, link-local, reserved, or malformed DNS targets are denied.'
      )
    );
  }
  if (!policy.allowedPurposes.includes(request.purpose)) {
    findings.push(
      finding(
        'AI-7004',
        '/purpose',
        'network-policy',
        'Egress purpose is outside the frozen allowlist.'
      )
    );
  }
  const allowRule = url
    ? policy.rules.find(
        (rule) =>
          rule.effect === 'allow' &&
          rule.tls === 'required' &&
          Number.isSafeInteger(rule.maxRequestBytes) &&
          rule.maxRequestBytes > 0 &&
          Number.isSafeInteger(rule.maxResponseBytes) &&
          rule.maxResponseBytes > 0 &&
          rule.methods.includes(request.method) &&
          rule.hosts.some((host) =>
            hostMatches(url!.hostname.toLowerCase(), host.toLowerCase())
          ) &&
          request.requestBytes <= rule.maxRequestBytes &&
          request.expectedMaximumResponseBytes <= rule.maxResponseBytes
      )
    : undefined;
  const denyRule = url
    ? policy.rules.find(
        (rule) =>
          rule.effect === 'deny' &&
          rule.hosts.some((host) =>
            hostMatches(url!.hostname.toLowerCase(), host.toLowerCase())
          )
      )
    : undefined;
  if (!allowRule || denyRule) {
    findings.push(
      finding(
        'AI-7004',
        '/rules',
        'network-policy',
        'No exact allow rule admits this host, method, and byte envelope.'
      )
    );
  }
  if (url && allowRule) {
    let prior = url;
    for (const [index, redirect] of request.redirectChain.entries()) {
      let next: URL;
      try {
        next = new URL(redirect, prior);
      } catch {
        findings.push(
          finding(
            'AI-7004',
            `/redirectChain/${index}`,
            'network-policy',
            'Redirect URL is invalid.'
          )
        );
        break;
      }
      if (
        allowRule.redirectPolicy === 'deny' ||
        origin(next) !== origin(prior) ||
        next.protocol !== 'https:' ||
        (next.port !== '' && next.port !== '443') ||
        Boolean(next.username) ||
        Boolean(next.password)
      ) {
        findings.push(
          finding(
            'AI-7004',
            `/redirectChain/${index}`,
            'network-policy',
            'Redirect crossed or violated the frozen origin policy.'
          )
        );
      }
      prior = next;
    }
  }
  const requestDigest = digestAgentCanonicalValue(request);
  const canonicalFindings = sortFindings(findings);
  const base = Object.freeze({
    allowed: canonicalFindings.every(({ blocking }) => !blocking),
    ...(allowRule && canonicalFindings.every(({ blocking }) => !blocking)
      ? { matchedRuleId: allowRule.id }
      : {}),
    findings: canonicalFindings,
    requestDigest,
  });
  return Object.freeze({
    ...base,
    decisionDigest: digestAgentCanonicalValue(base),
  });
};

type SecretRecord = Readonly<{ secretRef: string; value: string }>;

/** Test/server composition primitive; values exist only inside one callback. */
export class CallbackBoundAgentSecretTransport {
  readonly #secrets = new Map<string, string>();
  readonly #leases = new Map<string, AgentSecretCallbackLease>();
  readonly #used = new Set<string>();

  register(record: SecretRecord): void {
    if (
      !isAgentControlIdentity(record.secretRef) ||
      record.value.length < 8 ||
      this.#secrets.has(record.secretRef)
    ) {
      throw new TypeError('Secret reference registration is invalid.');
    }
    this.#secrets.set(record.secretRef, record.value);
  }

  issueLease(
    input: Omit<AgentSecretCallbackLease, 'leaseDigest'>
  ): AgentSecretCallbackLease {
    if (
      !hasExactAgentControlKeys(input, [
        'leaseId',
        'invocationId',
        'callbackId',
        'secretRefs',
        'purpose',
        'runtimeZone',
        'authorityDigest',
        'issuedAt',
        'expiresAt',
      ]) ||
      !isAgentControlIdentity(input.leaseId) ||
      !isAgentControlIdentity(input.invocationId) ||
      !isAgentControlIdentity(input.callbackId) ||
      !isAgentControlIdentity(input.purpose) ||
      !['server', 'native', 'sandbox'].includes(input.runtimeZone) ||
      !isAgentCanonicalDigest(input.authorityDigest) ||
      !isAgentControlInstant(input.issuedAt) ||
      !isAgentControlInstant(input.expiresAt) ||
      Date.parse(input.expiresAt) <= Date.parse(input.issuedAt) ||
      Date.parse(input.expiresAt) - Date.parse(input.issuedAt) >
        maximumSecretCallbackLeaseMs ||
      this.#leases.has(input.leaseId) ||
      !Array.isArray(input.secretRefs) ||
      input.secretRefs.length === 0 ||
      input.secretRefs.length > maximumSecretRefsPerLease ||
      new Set(input.secretRefs).size !== input.secretRefs.length ||
      input.secretRefs.some((ref) => !this.#secrets.has(ref))
    ) {
      throw new TypeError('Secret callback lease is invalid.');
    }
    const secretRefs = Object.freeze(
      [...input.secretRefs].sort(compareUnicodeCodePoints)
    );
    const base = Object.freeze({ ...input, secretRefs });
    const lease = Object.freeze({
      ...base,
      leaseDigest: digestAgentCanonicalValue(base),
    });
    this.#leases.set(lease.leaseId, lease);
    return lease;
  }

  async use<T>(
    input: Readonly<{
      lease: AgentSecretCallbackLease;
      invocationId: string;
      callbackId: string;
      purpose: string;
      usedAt: string;
      callback: (values: ReadonlyMap<string, string>) => Promise<T>;
    }>
  ): Promise<Readonly<{ value: T; receipt: AgentSecretCallbackUseReceipt }>> {
    const stored = this.#leases.get(input.lease.leaseId);
    if (
      !stored ||
      stored.leaseDigest !== input.lease.leaseDigest ||
      this.#used.has(stored.leaseId) ||
      stored.invocationId !== input.invocationId ||
      stored.callbackId !== input.callbackId ||
      stored.purpose !== input.purpose ||
      !isAgentControlInstant(input.usedAt) ||
      Date.parse(input.usedAt) < Date.parse(stored.issuedAt) ||
      Date.parse(input.usedAt) >= Date.parse(stored.expiresAt)
    ) {
      throw new Error(
        'Secret callback lease is missing, expired, replayed, or fenced.'
      );
    }
    this.#used.add(stored.leaseId);
    const values = new Map(
      stored.secretRefs.map((ref) => [ref, this.#secrets.get(ref)!])
    );
    const canaries = [...values.values()];
    let result: T;
    try {
      result = await input.callback(values);
    } finally {
      values.clear();
    }
    if (scanAgentArtifactForSecretCanaries(result, canaries).length > 0) {
      throw new Error('Secret callback result failed the no-leak invariant.');
    }
    const resultDigest = digestAgentCanonicalValue(
      cloneAgentControlJson(result)
    );
    const base = Object.freeze({
      leaseId: stored.leaseId,
      invocationId: stored.invocationId,
      callbackId: stored.callbackId,
      purpose: stored.purpose,
      resultDigest,
      usedAt: input.usedAt,
    });
    return Object.freeze({
      value: result,
      receipt: Object.freeze({
        ...base,
        receiptDigest: digestAgentCanonicalValue(base),
      }),
    });
  }
}

export const inspectAgentPublicEvaluationArtifact = (
  artifact: unknown,
  input: Readonly<{
    secretCanaries: readonly string[];
    protectedHoldoutCanaries: readonly string[];
    maximumBytes?: number;
  }>
): readonly AgentSecurityFinding[] => {
  const findings: AgentSecurityFinding[] = [];
  if (
    inspectAgentControlJson(artifact, input.maximumBytes ?? 8_388_608).length >
    0
  ) {
    findings.push(
      finding(
        'AI-9001',
        '/',
        'unsafe-artifact',
        'Evaluation artifact is not bounded safe JSON.'
      )
    );
  }
  findings.push(
    ...scanAgentArtifactForSecretCanaries(artifact, input.secretCanaries),
    ...scanAgentArtifactForProtectedHoldoutLeak(
      artifact,
      input.protectedHoldoutCanaries
    )
  );
  return sortFindings(findings);
};
