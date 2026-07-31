import {
  appendFileSync,
  lstatSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve } from 'node:path';
import { Command } from 'commander';
import {
  applyVerificationRunEvent,
  assessVerificationCiPromotion,
  createVerificationPlan,
  createVerificationRunEvent,
  createVerificationRunSnapshot,
  decodeVerificationEvidenceCandidate,
  decodeVerificationEvidenceVerifiedView,
  decodeVerificationCiJobContext,
  decodeVerificationPlan,
  decodeVerificationRunEvent,
  decodeVerificationRunSnapshot,
  encodeVerificationClosure,
  encodeVerificationPlan,
  encodeVerificationRunEvent,
  encodeVerificationRunSnapshot,
  evaluateVerificationClosure,
  digestVerificationValue,
  projectVerificationPlanExplanation,
  projectVerificationRunSummary,
  serializeVerificationValue,
  type CreateVerificationPlanInput,
  type EvaluateVerificationClosureInput,
  type VerificationCiIdentity,
  type VerificationEvidence,
  type VerificationEvidenceCandidate,
  type VerificationEvidenceVerifiedViewRecord,
  type VerificationPlan,
  type VerificationRunEvent,
  type VerificationRunOrigin,
  type VerificationRunScope,
  type VerificationRunSnapshot,
  type VerificationSurface,
} from '@prodivix/verification';

type JsonRecord = Readonly<Record<string, unknown>>;
type VerificationPlanCellView = Readonly<{
  id: string;
  surface: VerificationSurface;
  requirement: string;
  dependencyCellIds: readonly string[];
}>;

const EXIT = Object.freeze({
  success: 0,
  verificationFailed: 1,
  blockedOrIncomplete: 2,
  invalidContract: 3,
  infrastructure: 4,
});

export type VerificationPromotionResumeStep =
  | 'upload-and-finalize'
  | 'await-attestation'
  | 'finalize-attested'
  | 'recover-evidence'
  | 'stop-failed'
  | 'invalid';

export const resolveVerificationPromotionResumeStep = (
  state: string,
  hasAttestation: boolean
): VerificationPromotionResumeStep => {
  switch (state) {
    case 'staging':
      return 'upload-and-finalize';
    case 'verification-pending':
      return hasAttestation ? 'finalize-attested' : 'await-attestation';
    case 'committed':
      return 'recover-evidence';
    case 'failed':
      return 'stop-failed';
    default:
      return 'invalid';
  }
};

const MAXIMUM_JSON_BYTES = 64 * 1024 * 1024;
const MAXIMUM_NDJSON_BYTES = 64 * 1024 * 1024;
const MAXIMUM_RESPONSE_CHUNKS = 100_000;
const ACCESS_TOKEN_ENVIRONMENT_KEY =
  'PRODIVIX_VERIFICATION_ACCESS_TOKEN' as const;

class VerificationCliFailure extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.name = 'VerificationCliFailure';
    this.exitCode = exitCode;
  }
}

const isRecord = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const readText = (path: string, maximumBytes: number): string => {
  const bytes =
    path === '-' ? readFileSync(0) : readFileSync(path, { flag: 'r' });
  if (bytes.byteLength < 1 || bytes.byteLength > maximumBytes) {
    throw new VerificationCliFailure(
      'Input is empty or exceeds the bounded CLI contract.',
      EXIT.invalidContract
    );
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
};

const readJson = (path: string): unknown => {
  try {
    return JSON.parse(readText(path, MAXIMUM_JSON_BYTES)) as unknown;
  } catch (error) {
    if (error instanceof VerificationCliFailure) throw error;
    throw new VerificationCliFailure(
      'Input is not strict UTF-8 JSON.',
      EXIT.invalidContract
    );
  }
};

const writeJson = (path: string, value: unknown): void => {
  const text = `${serializeVerificationValue(value)}\n`;
  if (path === '-') {
    process.stdout.write(text);
  } else {
    writeFileSync(path, text, { encoding: 'utf8', flag: 'w' });
  }
};

const readPlanInput = (value: unknown): CreateVerificationPlanInput => {
  if (
    !isRecord(value) ||
    !isRecord(value.impactSet) ||
    !isRecord(value.policy) ||
    !Array.isArray(value.scenarios) ||
    !Array.isArray(value.checks) ||
    !Array.isArray(value.adapters) ||
    typeof value.policyEvaluationInstant !== 'string'
  ) {
    throw new VerificationCliFailure(
      'Planning input must contain impactSet, policy, scenarios, checks, adapters, and policyEvaluationInstant.',
      EXIT.invalidContract
    );
  }
  return value as unknown as CreateVerificationPlanInput;
};

const readPlan = (path: string): VerificationPlan => {
  const decoded = decodeVerificationPlan(readJson(path));
  if (!decoded.ok) {
    throw new VerificationCliFailure(
      'The supplied JSON is not a canonical versioned VerificationPlan.',
      EXIT.invalidContract
    );
  }
  return decoded.value;
};

const readRunSnapshot = (path: string): VerificationRunSnapshot => {
  const decoded = decodeVerificationRunSnapshot(readJson(path));
  if (!decoded.ok) {
    throw new VerificationCliFailure(
      'The supplied state is not a canonical versioned VerificationRun snapshot.',
      EXIT.invalidContract
    );
  }
  return decoded.value;
};

const parseNdjsonEvents = (path: string): readonly VerificationRunEvent[] => {
  const text = readText(path, MAXIMUM_NDJSON_BYTES);
  const lines = text.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  if (lines.length > 100_000) {
    throw new VerificationCliFailure(
      'Verification event stream exceeds its record budget.',
      EXIT.invalidContract
    );
  }
  return Object.freeze(
    lines.map((line) => {
      let value: unknown;
      try {
        value = JSON.parse(line) as unknown;
      } catch {
        throw new VerificationCliFailure(
          'Verification event stream contains invalid NDJSON.',
          EXIT.invalidContract
        );
      }
      const decoded = decodeVerificationRunEvent(value);
      if (!decoded.ok) {
        throw new VerificationCliFailure(
          'Verification event stream contains an invalid event.',
          EXIT.invalidContract
        );
      }
      return decoded.value;
    })
  );
};

const appendEvent = (path: string, event: VerificationRunEvent): void => {
  const line = `${serializeVerificationValue(encodeVerificationRunEvent(event))}\n`;
  if (path === '-') {
    process.stdout.write(line);
  } else {
    appendFileSync(path, line, { encoding: 'utf8', flag: 'a' });
  }
};

const applyEvents = (
  initial: VerificationRunSnapshot,
  events: readonly VerificationRunEvent[]
): VerificationRunSnapshot => {
  let snapshot = initial;
  for (const event of events) {
    const transition = applyVerificationRunEvent(snapshot, event);
    if (transition.status !== 'applied') {
      throw new VerificationCliFailure(
        transition.message,
        EXIT.invalidContract
      );
    }
    snapshot = transition.snapshot;
  }
  return snapshot;
};

const eventInstantAfter = (current: string, offsetMilliseconds = 1): string =>
  new Date(Date.parse(current) + offsetMilliseconds).toISOString();

const selectedPlanCells = (
  plan: VerificationPlan,
  surface: VerificationSurface,
  scope: VerificationRunScope,
  cellId: string | undefined
): readonly string[] => {
  const planCells = plan.cells as readonly VerificationPlanCellView[];
  const surfaceCells = planCells.filter((cell) => cell.surface === surface);
  let selected =
    scope === 'required'
      ? surfaceCells.filter(({ requirement }) => requirement === 'required')
      : surfaceCells;
  if (scope === 'cell') {
    if (!cellId) {
      throw new VerificationCliFailure(
        '--cell is required for cell scope.',
        EXIT.invalidContract
      );
    }
    const byId = new Map(planCells.map((cell) => [cell.id, cell] as const));
    const closure = new Set<string>();
    const visit = (id: string): void => {
      const cell = byId.get(id);
      if (!cell || cell.surface !== surface) {
        throw new VerificationCliFailure(
          'Selected cell or dependency does not belong to the requested surface.',
          EXIT.invalidContract
        );
      }
      if (closure.has(id)) return;
      closure.add(id);
      cell.dependencyCellIds.forEach(visit);
    };
    visit(cellId);
    selected = surfaceCells.filter(({ id }) => closure.has(id));
  }
  if (selected.length === 0) {
    throw new VerificationCliFailure(
      'No VerificationPlan cells match the requested run scope.',
      EXIT.blockedOrIncomplete
    );
  }
  return Object.freeze(selected.map(({ id }) => id));
};

const deterministicAttemptIds = (
  runId: string,
  cellIds: readonly string[]
): Readonly<Record<string, string>> =>
  Object.freeze(
    Object.fromEntries(
      cellIds.map((cellId) => {
        const digest = createHash('sha256')
          .update(`${runId}\0${cellId}`, 'utf8')
          .digest('hex');
        return [cellId, `attempt-${digest}`];
      })
    )
  );

const parseCiIdentity = (
  origin: VerificationRunOrigin,
  path: string | undefined
): VerificationCiIdentity | undefined => {
  if (origin !== 'ci') {
    if (path) {
      throw new VerificationCliFailure(
        '--ci-identity is only valid for CI-origin runs.',
        EXIT.invalidContract
      );
    }
    return undefined;
  }
  const value = path ? readJson(path) : undefined;
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 3 ||
    !Object.hasOwn(value, 'repository') ||
    !Object.hasOwn(value, 'ref') ||
    !Object.hasOwn(value, 'commit') ||
    typeof value.repository !== 'string' ||
    typeof value.ref !== 'string' ||
    typeof value.commit !== 'string'
  ) {
    throw new VerificationCliFailure(
      'CI-origin runs require a canonical provider-neutral CI identity file.',
      EXIT.invalidContract
    );
  }
  return {
    repository: value.repository,
    ref: value.ref,
    commit: value.commit,
  };
};

const exitCodeForSnapshot = (snapshot: VerificationRunSnapshot): number => {
  switch (snapshot.status) {
    case 'completed':
      return snapshot.closureVerdict === undefined ||
        snapshot.closureVerdict === 'satisfied'
        ? EXIT.success
        : EXIT.verificationFailed;
    case 'failed':
      return EXIT.verificationFailed;
    case 'blocked':
    case 'interrupted':
    case 'cancelled':
    case 'queued':
    case 'running':
    case 'cancelling':
      return EXIT.blockedOrIncomplete;
  }
  return EXIT.infrastructure;
};

const execute =
  (action: () => void | Promise<void>): (() => Promise<void>) =>
  async () => {
    try {
      await action();
    } catch (error) {
      const failure =
        error instanceof VerificationCliFailure
          ? error
          : new VerificationCliFailure(
              'Verification command failed at the infrastructure boundary.',
              EXIT.infrastructure
            );
      process.stderr.write(`${failure.message}\n`);
      process.exitCode = failure.exitCode;
    }
  };

const endpointUrl = (
  endpoint: string,
  workspaceId: string,
  suffix: string
): URL => {
  let base: URL;
  try {
    base = new URL(endpoint);
  } catch {
    throw new VerificationCliFailure(
      'Verification Backend endpoint is invalid.',
      EXIT.invalidContract
    );
  }
  if (
    (base.protocol !== 'https:' &&
      !(base.protocol === 'http:' && base.hostname === '127.0.0.1')) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  ) {
    throw new VerificationCliFailure(
      'Verification Backend endpoint must be HTTPS or loopback HTTP and contain no credentials.',
      EXIT.invalidContract
    );
  }
  const prefix = base.pathname.replace(/\/+$/u, '');
  base.pathname = `${prefix}/workspaces/${encodeURIComponent(workspaceId)}/verification${suffix}`;
  return base;
};

const accessToken = (): string => {
  const token = process.env[ACCESS_TOKEN_ENVIRONMENT_KEY]?.trim();
  const containsAsciiControlCharacter =
    token !== undefined &&
    [...token].some((character) => {
      const codePoint = character.codePointAt(0);
      return (
        codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)
      );
    });
  if (!token || token.length > 16_384 || containsAsciiControlCharacter) {
    throw new VerificationCliFailure(
      `${ACCESS_TOKEN_ENVIRONMENT_KEY} must contain one short-lived access token.`,
      EXIT.invalidContract
    );
  }
  return token;
};

const backendRequest = async (
  url: URL,
  init: RequestInit
): Promise<Readonly<{ status: number; body: unknown }>> => {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken()}`,
        ...init.headers,
      },
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new VerificationCliFailure(
      'Verification Backend is unavailable.',
      EXIT.infrastructure
    );
  }
  const declaredLength = response.headers.get('content-length');
  if (
    declaredLength !== null &&
    (!/^(?:0|[1-9][0-9]*)$/u.test(declaredLength) ||
      !Number.isSafeInteger(Number(declaredLength)) ||
      Number(declaredLength) > MAXIMUM_JSON_BYTES)
  ) {
    throw new VerificationCliFailure(
      'Verification Backend response exceeds its contract budget.',
      EXIT.infrastructure
    );
  }
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  if (reader) {
    for (let index = 0; ; index += 1) {
      if (index >= MAXIMUM_RESPONSE_CHUNKS) {
        await reader.cancel();
        throw new VerificationCliFailure(
          'Verification Backend response exceeds its contract budget.',
          EXIT.infrastructure
        );
      }
      const next = await reader.read();
      if (next.done) break;
      byteLength += next.value.byteLength;
      if (byteLength > MAXIMUM_JSON_BYTES) {
        await reader.cancel();
        throw new VerificationCliFailure(
          'Verification Backend response exceeds its contract budget.',
          EXIT.infrastructure
        );
      }
      chunks.push(next.value);
    }
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let body: unknown;
  try {
    body =
      bytes.byteLength === 0
        ? Object.freeze({})
        : (JSON.parse(
            new TextDecoder('utf-8', { fatal: true }).decode(bytes)
          ) as unknown);
  } catch {
    throw new VerificationCliFailure(
      'Verification Backend returned invalid JSON.',
      EXIT.infrastructure
    );
  }
  if (!response.ok && response.status !== 202) {
    throw new VerificationCliFailure(
      `Verification Backend rejected the request (${String(response.status)}).`,
      response.status >= 500 ? EXIT.infrastructure : EXIT.invalidContract
    );
  }
  return Object.freeze({ status: response.status, body });
};

const readCandidate = (path: string): VerificationEvidenceCandidate => {
  const decoded = decodeVerificationEvidenceCandidate(readJson(path));
  if (!decoded.ok) {
    throw new VerificationCliFailure(
      'Evidence Candidate is not canonical versioned JSON.',
      EXIT.invalidContract
    );
  }
  return decoded.value;
};

const requireCiPromotionAdmission = (
  candidate: VerificationEvidenceCandidate,
  ciJobPath: string | undefined
): void => {
  if (candidate.provenance.origin !== 'ci') {
    if (ciJobPath) {
      throw new VerificationCliFailure(
        '--ci-job is valid only for a CI-origin Candidate.',
        EXIT.invalidContract
      );
    }
    return;
  }
  if (!ciJobPath) {
    throw new VerificationCliFailure(
      'CI promotion requires a verified job context before the Backend challenge.',
      EXIT.blockedOrIncomplete
    );
  }
  const decoded = decodeVerificationCiJobContext(readJson(ciJobPath));
  if (!decoded.ok) {
    throw new VerificationCliFailure(
      'CI job context is not canonical versioned JSON.',
      EXIT.invalidContract
    );
  }
  const ci = candidate.provenance.ci;
  if (
    decoded.value.identity.repository !== ci.repository ||
    decoded.value.identity.ref !== ci.ref ||
    decoded.value.identity.commit !== ci.commit
  ) {
    throw new VerificationCliFailure(
      'CI job identity does not match the Evidence Candidate.',
      EXIT.invalidContract
    );
  }
  const admission = assessVerificationCiPromotion(decoded.value);
  if (admission.status !== 'allowed') {
    throw new VerificationCliFailure(
      'Untrusted CI event, fork, or OIDC identity cannot promote durable Evidence.',
      EXIT.blockedOrIncomplete
    );
  }
};

const readClosureEvaluationInput = (
  path: string
): EvaluateVerificationClosureInput => {
  const value = readJson(path);
  const requiredKeys = new Set([
    'wireVersion',
    'plan',
    'evidence',
    'verifiedEvidenceView',
    'closureEvaluationInstant',
    'targetRevision',
    'targetPartitionRevisions',
    'scenarioRegistryDigest',
    'semanticSchemaDigest',
    'providerSetDigest',
    'adapterRegistryDigest',
    'impactDigest',
    'policyRevision',
    'policyDigest',
    'compilerDigest',
    'plannerDigest',
    'baselineSetDigests',
    'toolchainSetDigest',
    'revocationRecordDigest',
    'revokedEvidenceIds',
  ]);
  const allowedKeys = new Set([...requiredKeys, 'runningCellIds']);
  if (
    !isRecord(value) ||
    value.wireVersion !== 1 ||
    !Array.isArray(value.evidence) ||
    !Array.isArray(value.baselineSetDigests) ||
    !Array.isArray(value.revokedEvidenceIds) ||
    Reflect.ownKeys(value).some(
      (key) => typeof key !== 'string' || !allowedKeys.has(key)
    ) ||
    [...requiredKeys].some((key) => !Object.hasOwn(value, key))
  ) {
    throw new VerificationCliFailure(
      'Closure input must be one strict prodivix.verification-closure-input.v1 object.',
      EXIT.invalidContract
    );
  }
  const planDecoded = decodeVerificationPlan(value.plan);
  const viewDecoded = decodeVerificationEvidenceVerifiedView(
    value.verifiedEvidenceView
  );
  if (!planDecoded.ok || !viewDecoded.ok) {
    throw new VerificationCliFailure(
      'Closure Plan or Backend-verified Evidence view is invalid.',
      EXIT.invalidContract
    );
  }
  const evidence = value.evidence as readonly unknown[];
  const verifiedByEvidenceId = new Map(
    (
      viewDecoded.value
        .records as readonly VerificationEvidenceVerifiedViewRecord[]
    ).map((record) => [record.evidenceId, record] as const)
  );
  if (
    evidence.some(
      (candidate) =>
        !isRecord(candidate) ||
        typeof candidate.id !== 'string' ||
        typeof candidate.planDigest !== 'string' ||
        candidate.planDigest !== planDecoded.value.planDigest ||
        candidate.workspaceId !== planDecoded.value.workspaceId ||
        candidate.workspaceRevision !== planDecoded.value.targetRevision ||
        verifiedByEvidenceId.get(candidate.id)?.materializedEvidenceDigest !==
          digestVerificationValue(candidate)
    )
  ) {
    throw new VerificationCliFailure(
      'Materialized Evidence is not bound to the exact verified view and Plan.',
      EXIT.invalidContract
    );
  }
  const {
    wireVersion: _wireVersion,
    plan: _plan,
    verifiedEvidenceView: _verifiedEvidenceView,
    evidence: _evidence,
    ...current
  } = value;
  return Object.freeze({
    ...current,
    plan: planDecoded.value,
    evidence: Object.freeze(evidence) as readonly VerificationEvidence[],
    verifiedEvidenceView: viewDecoded.value,
  }) as EvaluateVerificationClosureInput;
};

const safeArtifactPath = (root: string, path: string): string => {
  if (isAbsolute(path)) {
    throw new VerificationCliFailure(
      'Evidence artifact paths must be relative to --artifact-dir.',
      EXIT.invalidContract
    );
  }
  try {
    const absoluteRoot = realpathSync(resolve(root));
    const lexicalPath = resolve(absoluteRoot, path);
    const lexicalRelativePath = relative(absoluteRoot, lexicalPath);
    if (
      lexicalRelativePath === '' ||
      lexicalRelativePath.startsWith('..') ||
      isAbsolute(lexicalRelativePath)
    ) {
      throw new VerificationCliFailure(
        'Evidence artifact path escapes --artifact-dir.',
        EXIT.invalidContract
      );
    }
    const lexicalStat = lstatSync(lexicalPath);
    if (!lexicalStat.isFile() || lexicalStat.isSymbolicLink()) {
      throw new VerificationCliFailure(
        'Evidence artifact must be a regular non-symlink file.',
        EXIT.invalidContract
      );
    }
    const absolutePath = realpathSync(lexicalPath);
    const resolvedRelativePath = relative(absoluteRoot, absolutePath);
    if (
      resolvedRelativePath === '' ||
      resolvedRelativePath.startsWith('..') ||
      isAbsolute(resolvedRelativePath)
    ) {
      throw new VerificationCliFailure(
        'Evidence artifact path escapes --artifact-dir.',
        EXIT.invalidContract
      );
    }
    return absolutePath;
  } catch (error) {
    if (error instanceof VerificationCliFailure) throw error;
    throw new VerificationCliFailure(
      'Evidence artifact cannot be resolved beneath --artifact-dir.',
      EXIT.invalidContract
    );
  }
};

const uploadArtifacts = async (input: {
  endpoint: string;
  workspaceId: string;
  promotionId: string;
  capability: string;
  candidate: VerificationEvidenceCandidate;
  artifactDirectory?: string;
}): Promise<void> => {
  if (input.candidate.artifacts.length === 0) return;
  if (!input.artifactDirectory || !input.capability) {
    throw new VerificationCliFailure(
      'Artifact promotion requires --artifact-dir and a Backend upload capability.',
      EXIT.invalidContract
    );
  }
  for (const artifact of input.candidate.artifacts) {
    const path = safeArtifactPath(input.artifactDirectory, artifact.path);
    const bytes = readFileSync(path);
    const digest = `sha256-${createHash('sha256').update(bytes).digest('hex')}`;
    if (bytes.byteLength !== artifact.size || digest !== artifact.digest) {
      throw new VerificationCliFailure(
        'Evidence artifact bytes do not match the Candidate descriptor.',
        EXIT.invalidContract
      );
    }
    await backendRequest(
      endpointUrl(
        input.endpoint,
        input.workspaceId,
        `/promotions/${encodeURIComponent(input.promotionId)}/artifacts/${encodeURIComponent(artifact.id)}`
      ),
      {
        method: 'PUT',
        headers: {
          'Content-Type': artifact.mediaType,
          'X-Prodivix-Verification-Capability': input.capability,
          'X-Prodivix-Verification-Intent': 'upload',
        },
        body: bytes,
      }
    );
  }
};

export const createVerificationCommand = (): Command => {
  const verification = new Command('verify').description(
    'Plan, run, resume, promote, and evaluate canonical Verification'
  );

  const planCommand = verification
    .command('plan')
    .description('Create a deterministic versioned VerificationPlan')
    .requiredOption('-i, --input <path>', 'planning input JSON, or - for stdin')
    .option('-o, --output <path>', 'versioned plan JSON, or - for stdout', '-');

  planCommand.action(
    execute(() => {
      const options = planCommand.opts<{
        input: string;
        output: string;
      }>();
      const result = createVerificationPlan(
        readPlanInput(readJson(options.input))
      );
      writeJson(options.output, encodeVerificationPlan(result.plan));
      process.exitCode =
        result.status === 'blocked' ? EXIT.blockedOrIncomplete : EXIT.success;
    })
  );

  const explainCommand = verification
    .command('explain')
    .description('Project the shared Web/CLI/CI plan explanation JSON')
    .requiredOption('-p, --plan <path>', 'versioned VerificationPlan JSON')
    .option('-o, --output <path>', 'explanation JSON, or - for stdout', '-');
  explainCommand.action(
    execute(() => {
      const options = explainCommand.opts<{ plan: string; output: string }>();
      writeJson(
        options.output,
        projectVerificationPlanExplanation(readPlan(options.plan))
      );
      process.exitCode = EXIT.success;
    })
  );

  const runCommand = verification
    .command('run')
    .description(
      'Create a revision-bound run and optionally apply runner events'
    )
    .requiredOption('-p, --plan <path>', 'versioned VerificationPlan JSON')
    .requiredOption('--surface <surface>', 'preview, export, or ci')
    .requiredOption('--scope <scope>', 'impacted, required, all, or cell')
    .requiredOption('--run-id <id>', 'stable run identity')
    .requiredOption('--provider <id>', 'provider identity')
    .requiredOption('--at <instant>', 'explicit UTC creation instant')
    .requiredOption('--state <path>', 'run snapshot output path')
    .requiredOption('--journal <path>', 'append-only event NDJSON path')
    .option('--origin <origin>', 'cli or ci', 'cli')
    .option('--ci-identity <path>', 'provider-neutral CI identity JSON')
    .option('--cell <id>', 'single cell identity for cell scope')
    .option('--input-events <path>', 'runner event NDJSON to apply')
    .option('-o, --output <path>', 'run summary JSON, or - for stdout', '-');
  runCommand.action(
    execute(() => {
      const options = runCommand.opts<{
        plan: string;
        surface: VerificationSurface;
        scope: VerificationRunScope;
        runId: string;
        provider: string;
        at: string;
        state: string;
        journal: string;
        origin: VerificationRunOrigin;
        ciIdentity?: string;
        cell?: string;
        inputEvents?: string;
        output: string;
      }>();
      if (
        !(['preview', 'export', 'ci'] as const).includes(options.surface) ||
        !(['impacted', 'required', 'all', 'cell'] as const).includes(
          options.scope
        ) ||
        !(['cli', 'ci'] as const).includes(options.origin as 'cli' | 'ci') ||
        options.state === '-' ||
        options.journal === '-'
      ) {
        throw new VerificationCliFailure(
          'Verification run options are invalid.',
          EXIT.invalidContract
        );
      }
      const plan = readPlan(options.plan);
      const selectedCellIds = selectedPlanCells(
        plan,
        options.surface,
        options.scope,
        options.cell
      );
      let snapshot = createVerificationRunSnapshot({
        runId: options.runId,
        plan,
        surface: options.surface,
        scope: options.scope,
        providerId: options.provider,
        origin: options.origin,
        ...(options.origin === 'ci'
          ? {
              ci: parseCiIdentity(options.origin, options.ciIdentity)!,
            }
          : {}),
        selectedCellIds,
        attemptIdByCellId: deterministicAttemptIds(
          options.runId,
          selectedCellIds
        ),
        createdAt: options.at,
      });
      if (snapshot.status === 'queued') {
        const started = createVerificationRunEvent({
          eventId: `${options.runId}:start`,
          runId: options.runId,
          cursor: 1,
          occurredAt: eventInstantAfter(options.at),
          kind: 'run-started',
        });
        snapshot = applyEvents(snapshot, [started]);
        appendEvent(options.journal, started);
      }
      if (options.inputEvents) {
        const events = parseNdjsonEvents(options.inputEvents);
        snapshot = applyEvents(snapshot, events);
        events.forEach((next) => appendEvent(options.journal, next));
      }
      writeJson(options.state, encodeVerificationRunSnapshot(snapshot));
      writeJson(options.output, projectVerificationRunSummary(snapshot));
      process.exitCode = exitCodeForSnapshot(snapshot);
    })
  );

  const resumeCommand = verification
    .command('resume')
    .description('Resume cursor/promotion state without replaying attempts')
    .requiredOption('--run <path>', 'current versioned run snapshot')
    .requiredOption('--events <path>', 'new versioned event NDJSON')
    .requiredOption('--journal <path>', 'append-only event NDJSON path')
    .option(
      '-o, --output <path>',
      'updated run snapshot, or - for stdout',
      '-'
    );
  resumeCommand.action(
    execute(() => {
      const options = resumeCommand.opts<{
        run: string;
        events: string;
        journal: string;
        output: string;
      }>();
      const events = parseNdjsonEvents(options.events);
      const snapshot = applyEvents(readRunSnapshot(options.run), events);
      events.forEach((next) => appendEvent(options.journal, next));
      writeJson(options.run, encodeVerificationRunSnapshot(snapshot));
      writeJson(options.output, projectVerificationRunSummary(snapshot));
      process.exitCode = exitCodeForSnapshot(snapshot);
    })
  );

  const cancelCommand = verification
    .command('cancel')
    .description('Append an authority-bound cancellation request')
    .requiredOption('--run <path>', 'current versioned run snapshot')
    .requiredOption('--journal <path>', 'append-only event NDJSON path')
    .requiredOption('--reason <text>', 'bounded cancellation reason')
    .requiredOption('--at <instant>', 'explicit UTC cancellation instant')
    .option('-o, --output <path>', 'updated run summary, or - for stdout', '-');
  cancelCommand.action(
    execute(() => {
      const options = cancelCommand.opts<{
        run: string;
        journal: string;
        reason: string;
        at: string;
        output: string;
      }>();
      const current = readRunSnapshot(options.run);
      const cancellation = createVerificationRunEvent({
        eventId: `${current.runId}:cancel:${String(current.cursor + 1)}`,
        runId: current.runId,
        cursor: current.cursor + 1,
        occurredAt: options.at,
        kind: 'run-cancel-requested',
        reason: options.reason,
      });
      const snapshot = applyEvents(current, [cancellation]);
      appendEvent(options.journal, cancellation);
      writeJson(options.run, encodeVerificationRunSnapshot(snapshot));
      writeJson(options.output, projectVerificationRunSummary(snapshot));
      process.exitCode = exitCodeForSnapshot(snapshot);
    })
  );

  const promoteCommand = verification
    .command('promote')
    .description('Idempotently upload and finalize one Evidence Candidate')
    .requiredOption('--candidate <path>', 'versioned Evidence Candidate JSON')
    .requiredOption('--endpoint <url>', 'Verification Backend API base URL')
    .requiredOption('--idempotency-key <key>', 'opaque mutation identity')
    .option('--artifact-dir <path>', 'root for candidate artifact paths')
    .option('--attestation <path>', 'signed attestation presentation JSON')
    .option('--ci-job <path>', 'versioned verified CI job context JSON')
    .option(
      '-o, --output <path>',
      'promotion result JSON, or - for stdout',
      '-'
    );
  promoteCommand.action(
    execute(async () => {
      const options = promoteCommand.opts<{
        candidate: string;
        endpoint: string;
        idempotencyKey: string;
        artifactDir?: string;
        attestation?: string;
        ciJob?: string;
        output: string;
      }>();
      const candidate = readCandidate(options.candidate);
      requireCiPromotionAdmission(candidate, options.ciJob);
      const created = await backendRequest(
        endpointUrl(options.endpoint, candidate.workspaceId, '/promotions'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': options.idempotencyKey,
            'X-Prodivix-Verification-Intent': 'create',
          },
          body: serializeVerificationValue(readJson(options.candidate)),
        }
      );
      const promotion = isRecord(created.body)
        ? created.body.promotion
        : undefined;
      if (
        !isRecord(promotion) ||
        typeof promotion.promotionId !== 'string' ||
        typeof promotion.state !== 'string'
      ) {
        throw new VerificationCliFailure(
          'Verification Backend promotion response is invalid.',
          EXIT.infrastructure
        );
      }
      const capability =
        typeof promotion.uploadCapability === 'string'
          ? promotion.uploadCapability
          : '';
      const resumeStep = resolveVerificationPromotionResumeStep(
        promotion.state,
        Boolean(options.attestation)
      );
      if (resumeStep === 'recover-evidence') {
        if (typeof promotion.evidenceId !== 'string') {
          throw new VerificationCliFailure(
            'Committed promotion omitted its Evidence identity.',
            EXIT.infrastructure
          );
        }
        const recovered = await backendRequest(
          endpointUrl(
            options.endpoint,
            candidate.workspaceId,
            `/evidence/${encodeURIComponent(promotion.evidenceId)}`
          ),
          { method: 'GET' }
        );
        writeJson(options.output, recovered.body);
        process.exitCode = EXIT.success;
        return;
      }
      if (resumeStep === 'stop-failed') {
        writeJson(options.output, created.body);
        process.exitCode = EXIT.verificationFailed;
        return;
      }
      if (resumeStep === 'await-attestation') {
        writeJson(options.output, created.body);
        process.exitCode = EXIT.blockedOrIncomplete;
        return;
      }
      if (resumeStep === 'invalid') {
        throw new VerificationCliFailure(
          'Verification Backend returned an unsupported promotion state.',
          EXIT.infrastructure
        );
      }
      if (resumeStep === 'upload-and-finalize') {
        await uploadArtifacts({
          endpoint: options.endpoint,
          workspaceId: candidate.workspaceId,
          promotionId: promotion.promotionId,
          capability,
          candidate,
          artifactDirectory: options.artifactDir,
        });
      }
      const finalized = await backendRequest(
        endpointUrl(
          options.endpoint,
          candidate.workspaceId,
          `/promotions/${encodeURIComponent(promotion.promotionId)}/finalize`
        ),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Prodivix-Verification-Capability': capability,
            'X-Prodivix-Verification-Intent': 'finalize',
          },
          body: serializeVerificationValue({
            ...(resumeStep === 'finalize-attested' && options.attestation
              ? { attestation: readJson(options.attestation) }
              : {}),
          }),
        }
      );
      writeJson(options.output, finalized.body);
      process.exitCode =
        finalized.status === 202 ? EXIT.blockedOrIncomplete : EXIT.success;
    })
  );

  const closureCommand = verification
    .command('closure')
    .description('Evaluate and emit one versioned canonical Closure')
    .requiredOption(
      '-i, --input <path>',
      'versioned Closure evaluation input JSON'
    )
    .option(
      '-o, --output <path>',
      'versioned Closure JSON, or - for stdout',
      '-'
    );
  closureCommand.action(
    execute(() => {
      const options = closureCommand.opts<{
        input: string;
        output: string;
      }>();
      const result = evaluateVerificationClosure(
        readClosureEvaluationInput(options.input)
      );
      if (result.status !== 'ready') {
        throw new VerificationCliFailure(result.message, EXIT.invalidContract);
      }
      writeJson(options.output, encodeVerificationClosure(result.closure));
      process.exitCode =
        result.closure.verdict === 'satisfied'
          ? EXIT.success
          : result.closure.verdict === 'unsatisfied'
            ? EXIT.verificationFailed
            : EXIT.blockedOrIncomplete;
    })
  );

  return verification;
};
