import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';

import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';

export const AGENT_EVALUATION_OWNER_AUTHORITY_REPLAY_RECORD_FORMAT =
  'prodivix.agent-evaluation-owner-authority-replay-record' as const;
export const AGENT_EVALUATION_OWNER_AUTHORITY_REPLAY_RECORD_VERSION =
  1 as const;

const maximumRecordBytes = 65_536;

export type AgentEvaluationOwnerAuthorityServiceKind =
  | 'controlled-workspace'
  | 'verification-evidence'
  | 'provider-capability'
  | 'attempt-grading';

export type AgentEvaluationOwnerAuthorityReplayBinding = Readonly<{
  serviceKind: AgentEvaluationOwnerAuthorityServiceKind;
  requestDigest: CanonicalDigest;
  requestBindingDigest: CanonicalDigest;
  claimGeneration: number;
}>;

export type AgentEvaluationOwnerAuthorityReplayRecord =
  AgentEvaluationOwnerAuthorityReplayBinding &
    Readonly<{
      format: typeof AGENT_EVALUATION_OWNER_AUTHORITY_REPLAY_RECORD_FORMAT;
      version: typeof AGENT_EVALUATION_OWNER_AUTHORITY_REPLAY_RECORD_VERSION;
      state: 'claimed' | 'dispatched' | 'accepted';
      dispatchReceiptDigest?: CanonicalDigest;
      responseDigest?: CanonicalDigest;
      recordDigest: CanonicalDigest;
    }>;

export interface AgentEvaluationOwnerAuthorityReplayJournal {
  readonly implementationDigest: CanonicalDigest;
  claim(
    binding: AgentEvaluationOwnerAuthorityReplayBinding
  ): Promise<AgentEvaluationOwnerAuthorityReplayRecord>;
  markDispatched(
    binding: AgentEvaluationOwnerAuthorityReplayBinding,
    dispatchReceiptDigest: CanonicalDigest
  ): Promise<AgentEvaluationOwnerAuthorityReplayRecord>;
  accept(
    binding: AgentEvaluationOwnerAuthorityReplayBinding,
    responseDigest: CanonicalDigest
  ): Promise<AgentEvaluationOwnerAuthorityReplayRecord>;
}

const fail = (message: string): never => {
  throw new TypeError(`G4_OWNER_AUTHORITY_REPLAY_INVALID: ${message}`);
};

const exactRecord = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is Record<string, unknown> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) =>
      !isUnsafeObjectKey(key) &&
      (required.includes(key) || optional.includes(key))
  );

const createRecord = (
  binding: AgentEvaluationOwnerAuthorityReplayBinding,
  state: AgentEvaluationOwnerAuthorityReplayRecord['state'],
  dispatchReceiptDigest?: CanonicalDigest,
  responseDigest?: CanonicalDigest
): AgentEvaluationOwnerAuthorityReplayRecord => {
  if (
    ![
      'controlled-workspace',
      'verification-evidence',
      'provider-capability',
      'attempt-grading',
    ].includes(binding.serviceKind) ||
    !isAgentCanonicalDigest(binding.requestDigest) ||
    !isAgentCanonicalDigest(binding.requestBindingDigest) ||
    !Number.isSafeInteger(binding.claimGeneration) ||
    binding.claimGeneration !== 1 ||
    (dispatchReceiptDigest !== undefined &&
      !isAgentCanonicalDigest(dispatchReceiptDigest)) ||
    (responseDigest !== undefined && !isAgentCanonicalDigest(responseDigest)) ||
    (state === 'claimed' &&
      (dispatchReceiptDigest !== undefined || responseDigest !== undefined)) ||
    (state === 'dispatched' &&
      (dispatchReceiptDigest === undefined || responseDigest !== undefined)) ||
    (state === 'accepted' &&
      (dispatchReceiptDigest === undefined || responseDigest === undefined))
  ) {
    return fail('Replay binding is invalid.');
  }
  const base = Object.freeze({
    format: AGENT_EVALUATION_OWNER_AUTHORITY_REPLAY_RECORD_FORMAT,
    version: AGENT_EVALUATION_OWNER_AUTHORITY_REPLAY_RECORD_VERSION,
    serviceKind: binding.serviceKind,
    requestDigest: binding.requestDigest,
    requestBindingDigest: binding.requestBindingDigest,
    claimGeneration: binding.claimGeneration,
    state,
    ...(dispatchReceiptDigest ? { dispatchReceiptDigest } : {}),
    ...(responseDigest ? { responseDigest } : {}),
  });
  return Object.freeze({
    ...base,
    recordDigest: digestAgentCanonicalValue(base),
  });
};

const decodeRecord = (
  source: Uint8Array
): AgentEvaluationOwnerAuthorityReplayRecord => {
  if (source.byteLength < 1 || source.byteLength > maximumRecordBytes) {
    return fail('Replay record is outside the byte budget.');
  }
  let value: unknown;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(source);
    value = JSON.parse(text, (key, entry: unknown) => {
      if (key && isUnsafeObjectKey(key)) return fail('Unsafe replay key.');
      return entry;
    }) as unknown;
    if (canonicalJsonText(value) !== text) {
      return fail('Replay record is not canonical JSON.');
    }
  } catch (caught) {
    if (
      caught instanceof TypeError &&
      caught.message.startsWith('G4_OWNER_AUTHORITY_REPLAY_INVALID:')
    ) {
      throw caught;
    }
    return fail('Replay record is not decodable.');
  }
  if (
    !exactRecord(
      value,
      [
        'format',
        'version',
        'serviceKind',
        'requestDigest',
        'requestBindingDigest',
        'claimGeneration',
        'state',
        'recordDigest',
      ],
      ['dispatchReceiptDigest', 'responseDigest']
    ) ||
    value.format !== AGENT_EVALUATION_OWNER_AUTHORITY_REPLAY_RECORD_FORMAT ||
    value.version !== AGENT_EVALUATION_OWNER_AUTHORITY_REPLAY_RECORD_VERSION ||
    ![
      'controlled-workspace',
      'verification-evidence',
      'provider-capability',
      'attempt-grading',
    ].includes(String(value.serviceKind)) ||
    !isAgentCanonicalDigest(value.requestDigest) ||
    !isAgentCanonicalDigest(value.requestBindingDigest) ||
    value.claimGeneration !== 1 ||
    (value.state !== 'claimed' &&
      value.state !== 'dispatched' &&
      value.state !== 'accepted') ||
    (value.dispatchReceiptDigest !== undefined &&
      !isAgentCanonicalDigest(value.dispatchReceiptDigest)) ||
    (value.responseDigest !== undefined &&
      !isAgentCanonicalDigest(value.responseDigest)) ||
    !isAgentCanonicalDigest(value.recordDigest)
  ) {
    return fail('Replay record shape is invalid.');
  }
  const record = value as unknown as AgentEvaluationOwnerAuthorityReplayRecord;
  const recreated = createRecord(
    record,
    record.state,
    record.dispatchReceiptDigest,
    record.responseDigest
  );
  if (!sameCanonicalJson(recreated, record)) {
    return fail('Replay record digest drifted.');
  }
  return recreated;
};

const sameBinding = (
  record: AgentEvaluationOwnerAuthorityReplayRecord,
  binding: AgentEvaluationOwnerAuthorityReplayBinding
): boolean =>
  record.serviceKind === binding.serviceKind &&
  record.requestDigest === binding.requestDigest &&
  record.requestBindingDigest === binding.requestBindingDigest &&
  record.claimGeneration === binding.claimGeneration;

const writeAtomic = async (path: string, value: unknown): Promise<void> => {
  const source = new TextEncoder().encode(canonicalJsonText(value));
  if (source.byteLength > maximumRecordBytes) {
    source.fill(0);
    return fail('Replay record is outside the byte budget.');
  }
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(source);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, path);
    handle = await open(path, 'r');
    await handle.sync();
    await handle.close();
    handle = undefined;
    if (process.platform !== 'win32') {
      handle = await open(dirname(path), 'r');
      await handle.sync();
      await handle.close();
      handle = undefined;
    }
  } finally {
    source.fill(0);
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
  }
};

const readRecord = async (
  path: string
): Promise<AgentEvaluationOwnerAuthorityReplayRecord | undefined> => {
  try {
    const source = await readFile(path);
    try {
      return decodeRecord(source);
    } finally {
      source.fill(0);
    }
  } catch (caught) {
    if (
      caught &&
      typeof caught === 'object' &&
      'code' in caught &&
      caught.code === 'ENOENT'
    ) {
      return undefined;
    }
    throw caught;
  }
};

const ensureDirectory = async (directory: string): Promise<string> => {
  if (
    typeof directory !== 'string' ||
    directory !== directory.trim() ||
    !isAbsolute(directory)
  ) {
    return fail('Replay directory must be an absolute path.');
  }
  const target = resolve(directory);
  if (target === parse(target).root) {
    return fail('Replay directory cannot be a filesystem root.');
  }
  await mkdir(target, { recursive: true, mode: 0o700 });
  const metadata = await lstat(target);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    return fail('Replay directory must be a concrete directory.');
  }
  return target;
};

export const createFileAgentEvaluationOwnerAuthorityReplayJournal = async (
  directory: string
): Promise<AgentEvaluationOwnerAuthorityReplayJournal> => {
  const root = await ensureDirectory(directory);
  const implementationDigest = digestAgentCanonicalValue({
    packageName: '@prodivix/agent-evaluation-runner',
    owner: 'file-owner-authority-replay-journal',
    version: 2,
    persistence: 'append-only-claim-dispatch-accept-commitments',
    payloadPersistence: 'forbidden',
    responsePersistence: 'digest-only',
  });

  const pathsFor = async (
    binding: AgentEvaluationOwnerAuthorityReplayBinding
  ) => {
    createRecord(binding, 'claimed');
    const serviceDirectory = join(root, binding.serviceKind);
    const requestDirectory = join(serviceDirectory, binding.requestDigest);
    await mkdir(serviceDirectory, { recursive: true, mode: 0o700 });
    await mkdir(requestDirectory, { recursive: true, mode: 0o700 });
    const metadata = await lstat(requestDirectory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      return fail('Replay request path is invalid.');
    }
    return Object.freeze({
      claimed: join(requestDirectory, 'claimed.json'),
      dispatched: join(requestDirectory, 'dispatched.json'),
      accepted: join(requestDirectory, 'accepted.json'),
    });
  };

  const load = async (
    binding: AgentEvaluationOwnerAuthorityReplayBinding
  ): Promise<AgentEvaluationOwnerAuthorityReplayRecord | undefined> => {
    const paths = await pathsFor(binding);
    const accepted = await readRecord(paths.accepted);
    if (accepted) {
      if (!sameBinding(accepted, binding) || accepted.state !== 'accepted') {
        return fail('Accepted replay binding drifted.');
      }
      return accepted;
    }
    const dispatched = await readRecord(paths.dispatched);
    if (dispatched) {
      if (
        !sameBinding(dispatched, binding) ||
        dispatched.state !== 'dispatched'
      ) {
        return fail('Dispatched replay binding drifted.');
      }
      return dispatched;
    }
    const claimed = await readRecord(paths.claimed);
    if (
      claimed &&
      (!sameBinding(claimed, binding) || claimed.state !== 'claimed')
    ) {
      return fail('Claimed replay binding drifted.');
    }
    return claimed;
  };

  const claim: AgentEvaluationOwnerAuthorityReplayJournal['claim'] = async (
    binding
  ) => {
    const existing = await load(binding);
    if (existing) return existing;
    const paths = await pathsFor(binding);
    const record = createRecord(binding, 'claimed');
    try {
      await writeAtomic(paths.claimed, record);
      return record;
    } catch (caught) {
      if (
        caught &&
        typeof caught === 'object' &&
        'code' in caught &&
        (caught.code === 'EEXIST' || caught.code === 'EPERM')
      ) {
        const replay = await load(binding);
        if (replay) return replay;
      }
      throw caught;
    }
  };
  const accept: AgentEvaluationOwnerAuthorityReplayJournal['accept'] = async (
    binding,
    responseDigest
  ) => {
    const dispatched = await markDispatched(
      binding,
      (await claim(binding)).dispatchReceiptDigest ??
        fail('Owner dispatch receipt is unavailable.')
    );
    if (dispatched.state === 'accepted') {
      if (dispatched.responseDigest !== responseDigest) {
        return fail('Accepted response digest drifted.');
      }
      return dispatched;
    }
    const paths = await pathsFor(binding);
    const accepted = createRecord(
      binding,
      'accepted',
      dispatched.dispatchReceiptDigest,
      responseDigest
    );
    try {
      await writeAtomic(paths.accepted, accepted);
      return accepted;
    } catch (caught) {
      if (
        caught &&
        typeof caught === 'object' &&
        'code' in caught &&
        (caught.code === 'EEXIST' || caught.code === 'EPERM')
      ) {
        const replay = await load(binding);
        if (
          replay?.state === 'accepted' &&
          replay.responseDigest === responseDigest
        ) {
          return replay;
        }
      }
      throw caught;
    }
  };
  const markDispatched: AgentEvaluationOwnerAuthorityReplayJournal['markDispatched'] =
    async (binding, dispatchReceiptDigest) => {
      const current = await claim(binding);
      if (current.state === 'accepted') {
        if (current.dispatchReceiptDigest !== dispatchReceiptDigest) {
          return fail('Accepted dispatch receipt drifted.');
        }
        return current;
      }
      if (current.state === 'dispatched') {
        if (current.dispatchReceiptDigest !== dispatchReceiptDigest) {
          return fail('Dispatched receipt drifted.');
        }
        return current;
      }
      const paths = await pathsFor(binding);
      const dispatched = createRecord(
        binding,
        'dispatched',
        dispatchReceiptDigest
      );
      try {
        await writeAtomic(paths.dispatched, dispatched);
        return dispatched;
      } catch (caught) {
        if (
          caught &&
          typeof caught === 'object' &&
          'code' in caught &&
          (caught.code === 'EEXIST' || caught.code === 'EPERM')
        ) {
          const replay = await load(binding);
          if (
            replay &&
            replay.state !== 'claimed' &&
            replay.dispatchReceiptDigest === dispatchReceiptDigest
          ) {
            return replay;
          }
        }
        throw caught;
      }
    };
  return Object.freeze({
    implementationDigest,
    claim,
    markDispatched,
    accept,
  });
};
