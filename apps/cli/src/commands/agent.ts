import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { Command } from 'commander';
import {
  createAgentApprovalDecision,
  createAgentRunUserCommand,
  decodeAgentControlFact,
  decodeAgentProductLedgerBundle,
  decodeAgentProductView,
  decodeAgentProposalFact,
  encodeAgentProductFact,
  encodeAgentProductView,
  encodeAgentProposalFact,
  type AgentProductView,
  type AgentRunUserCommandKind,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { WORKSPACE_AGENT_ACTION_REGISTRY } from '@prodivix/workspace';

const MAXIMUM_JSON_BYTES = 8_388_608;
const ACCESS_TOKEN_ENVIRONMENT_KEY = 'PRODIVIX_ACCESS_TOKEN';

type RemoteOptions = Readonly<{
  baseUrl: string;
  project: string;
  workspace: string;
  run?: string;
  output: string;
}>;

type InspectOptions = Readonly<{
  input?: string;
  baseUrl?: string;
  project?: string;
  workspace?: string;
  run?: string;
  output: string;
}>;

type ActorOptions = RemoteOptions &
  Readonly<{ actor: string; reason?: string }>;

const readJson = (path: string): unknown => {
  const bytes = path === '-' ? readFileSync(0) : readFileSync(path);
  if (bytes.byteLength < 1 || bytes.byteLength > MAXIMUM_JSON_BYTES) {
    throw new TypeError('Agent JSON input is empty or exceeds 8 MiB.');
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
};

const writeText = (path: string, value: string): void => {
  const text = value.endsWith('\n') ? value : `${value}\n`;
  if (path === '-') {
    process.stdout.write(text);
    return;
  }
  writeFileSync(path, text, { encoding: 'utf8', flag: 'w' });
};

const accessToken = (): string => {
  const token = process.env[ACCESS_TOKEN_ENVIRONMENT_KEY]?.trim();
  if (!token) {
    throw new TypeError(`${ACCESS_TOKEN_ENVIRONMENT_KEY} is required.`);
  }
  return token;
};

const agentBase = (options: RemoteOptions): string => {
  const url = new URL(options.baseUrl);
  const suppliedPath = url.pathname.replace(/\/+$/u, '');
  const apiPath = suppliedPath.endsWith('/api')
    ? suppliedPath
    : `${suppliedPath}/api`;
  url.pathname = `${apiPath}/projects/${encodeURIComponent(options.project)}/workspaces/${encodeURIComponent(options.workspace)}/agent`;
  return url.toString().replace(/\/$/u, '');
};

const request = async (
  url: string,
  init: RequestInit = {}
): Promise<Response> => {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      Accept: 'application/json',
      ...init.headers,
    },
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 4_096);
    throw new Error(
      `Agent API ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`
    );
  }
  return response;
};

const requireRun = (options: RemoteOptions): string => {
  const runId = options.run?.trim();
  if (!runId) throw new TypeError('--run is required.');
  return runId;
};

const loadView = async (options: RemoteOptions): Promise<AgentProductView> => {
  const runId = requireRun(options);
  const response = await request(
    `${agentBase(options)}/runs/${encodeURIComponent(runId)}/product`
  );
  const decoded = decodeAgentProductLedgerBundle(
    WORKSPACE_AGENT_ACTION_REGISTRY,
    await response.json()
  );
  if (!decoded.ok) throw new TypeError(decoded.message);
  return decoded.value;
};

const printView = (
  options: Readonly<{ output: string }>,
  view: AgentProductView
): void =>
  writeText(options.output, canonicalJsonText(encodeAgentProductView(view)));

const addRemoteOptions = (
  command: Command,
  input: Readonly<{ run?: boolean; actor?: boolean }> = {}
): Command => {
  command
    .requiredOption('--base-url <url>', 'Backend origin or API base URL')
    .requiredOption('--project <id>', 'exact project id')
    .requiredOption('--workspace <id>', 'exact Workspace id')
    .option('--output <path>', 'output path, or - for stdout', '-');
  if (input.run) command.requiredOption('--run <id>', 'exact durable Run id');
  if (input.actor)
    command.requiredOption('--actor <id>', 'authenticated human principal id');
  return command;
};

const createInspectCommand = (): Command => {
  const command = new Command('inspect')
    .description(
      'strictly inspect a product view wire or authenticated durable Run'
    )
    .option('--input <path>', 'strict Agent product view wire, or - for stdin')
    .option('--base-url <url>', 'Backend origin or API base URL')
    .option('--project <id>', 'exact project id')
    .option('--workspace <id>', 'exact Workspace id')
    .option('--run <id>', 'exact durable Run id')
    .option('--output <path>', 'output path, or - for stdout', '-');
  command.action(async () => {
    const options = command.opts<InspectOptions>();
    if (options.input) {
      if (
        options.baseUrl ||
        options.project ||
        options.workspace ||
        options.run
      ) {
        throw new TypeError('Use either --input or authenticated Run options.');
      }
      const decoded = decodeAgentProductView(readJson(options.input));
      if (!decoded.ok) {
        throw new TypeError(
          decoded.issues
            .map(({ path, message }) => `${path}: ${message}`)
            .join('; ')
        );
      }
      printView(options, decoded.value);
      return;
    }
    if (
      !options.baseUrl?.trim() ||
      !options.project?.trim() ||
      !options.workspace?.trim() ||
      !options.run?.trim()
    ) {
      throw new TypeError(
        '--base-url, --project, --workspace, and --run are required without --input.'
      );
    }
    const remoteOptions: RemoteOptions = {
      baseUrl: options.baseUrl,
      project: options.project,
      workspace: options.workspace,
      run: options.run,
      output: options.output,
    };
    printView(remoteOptions, await loadView(remoteOptions));
  });
  return command;
};

const createRunCommand = (): Command => {
  const command = addRemoteOptions(
    new Command('run').description(
      'read the current durable Run product projection'
    ),
    { run: true }
  );
  command.action(async () => {
    const options = command.opts<RemoteOptions>();
    printView(options, await loadView(options));
  });
  return command;
};

const createTaskCommand = (): Command => {
  const command = addRemoteOptions(
    new Command('create')
      .description('create an exact Task fact; this grants no approval')
      .requiredOption('--fact <path>', 'strict task-record wire JSON')
  );
  command.action(async () => {
    const options = command.opts<RemoteOptions & { fact: string }>();
    const wire = readJson(options.fact);
    const decoded = decodeAgentControlFact(wire);
    if (!decoded.ok || decoded.value.factType !== 'task-record') {
      throw new TypeError('Expected one strict task-record wire fact.');
    }
    const response = await request(`${agentBase(options)}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: canonicalJsonText(wire),
    });
    writeText(options.output, canonicalJsonText(await response.json()));
  });
  return command;
};

const createProposalInspectionCommand = (
  name: 'propose' | 'plan',
  factType: 'preview' | 'planning'
): Command => {
  const command = new Command(name)
    .description(
      name === 'propose'
        ? 'strictly inspect a proposal preview without applying it'
        : 'strictly inspect a proposal planning receipt without applying it'
    )
    .requiredOption('--fact <path>', `strict ${factType} wire JSON`)
    .option('--output <path>', 'output path, or - for stdout', '-');
  command.action(() => {
    const options = command.opts<{ fact: string; output: string }>();
    const wire = readJson(options.fact);
    const decoded = decodeAgentProposalFact(
      WORKSPACE_AGENT_ACTION_REGISTRY,
      wire
    );
    if (!decoded.ok || decoded.value.factType !== factType) {
      throw new TypeError(`Expected one strict ${factType} wire fact.`);
    }
    writeText(options.output, canonicalJsonText(wire));
  });
  return command;
};

const createRunIntentCommand = (kind: AgentRunUserCommandKind): Command => {
  const command = addRemoteOptions(
    new Command(kind).description(
      `record an explicit human ${kind} intent against the current Run snapshot`
    ),
    { run: true, actor: true }
  ).option('--reason <text>', 'bounded human reason');
  command.action(async () => {
    const options = command.opts<ActorOptions>();
    const view = await loadView(options);
    const identity = randomUUID().replaceAll('-', '.');
    const commandFact = createAgentRunUserCommand({
      commandId: `command.cli.${identity}`,
      taskId: view.identity.taskId,
      runId: view.identity.runId,
      kind,
      actor: Object.freeze({
        kind: 'user' as const,
        principalId: options.actor,
      }),
      expectedGeneration: view.identity.generation,
      expectedSnapshotDigest: view.identity.runSnapshotDigest,
      idempotencyKey: `idempotency.cli.${identity}`,
      ...(options.reason ? { reason: options.reason.trim() } : {}),
      requestedAt: new Date().toISOString(),
    });
    const response = await request(
      `${agentBase(options)}/runs/${encodeURIComponent(view.identity.runId)}/commands`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: canonicalJsonText(
          encodeAgentProductFact({
            factType: 'run-user-command',
            value: commandFact,
          })
        ),
      }
    );
    writeText(options.output, canonicalJsonText(await response.json()));
  });
  return command;
};

const createDecisionCommand = (
  requestedDecision: 'approved' | 'rejected'
): Command => {
  const name = requestedDecision === 'approved' ? 'approve' : 'reject';
  const command = addRemoteOptions(
    new Command(name).description(
      `${name} the exact current proposal as an authenticated human decision`
    ),
    { run: true, actor: true }
  ).option('--reason <text>', 'bounded human reason');
  if (requestedDecision === 'approved') {
    command.requiredOption(
      '--rollback <authorization>',
      'explicit rollback authorization: none or on-unsatisfied-closure'
    );
  }
  command.action(async () => {
    const options = command.opts<ActorOptions & { rollback?: string }>();
    const view = await loadView(options);
    if (!view.preview || !view.planning) {
      throw new TypeError(
        'The durable Run has no exact proposal preview and plan.'
      );
    }
    const rollbackAuthorization =
      requestedDecision === 'rejected' ? 'none' : options.rollback;
    if (
      rollbackAuthorization !== 'none' &&
      rollbackAuthorization !== 'on-unsatisfied-closure'
    ) {
      throw new TypeError('--rollback must be none or on-unsatisfied-closure.');
    }
    const identity = randomUUID().replaceAll('-', '.');
    const decision = createAgentApprovalDecision({
      decisionId: `decision.cli.${identity}`,
      decision: requestedDecision,
      actor: Object.freeze({
        kind: 'user' as const,
        principalId: options.actor,
      }),
      taskId: view.identity.taskId,
      runId: view.identity.runId,
      previewId: view.preview.previewId,
      previewDigest: view.preview.previewDigest,
      baseRevision: view.preview.baseRevision,
      transactionDigest: view.planning.transactionDigest,
      impactDigest: view.planning.impactDigest,
      verificationPlanDigest: view.planning.verificationPlanDigest,
      grantRef: view.run.grantRef,
      policyDigest: view.run.policyDigest,
      rollbackAuthorization,
      ...(options.reason ? { reason: options.reason.trim() } : {}),
      decidedAt: new Date().toISOString(),
      expiresAt: view.preview.expiresAt,
    });
    const response = await request(`${agentBase(options)}/approvals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: canonicalJsonText(
        encodeAgentProposalFact(WORKSPACE_AGENT_ACTION_REGISTRY, {
          factType: 'approval',
          value: decision,
        })
      ),
    });
    writeText(options.output, canonicalJsonText(await response.json()));
  });
  return command;
};

const createAuditCommand = (): Command => {
  const command = addRemoteOptions(
    new Command('export').description(
      'export the authenticated immutable Run audit ledger'
    ),
    { run: true }
  );
  command.action(async () => {
    const options = command.opts<RemoteOptions>();
    const runId = requireRun(options);
    const response = await request(
      `${agentBase(options)}/runs/${encodeURIComponent(runId)}/audit`
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 1 || bytes.byteLength > MAXIMUM_JSON_BYTES) {
      throw new TypeError('Audit export is empty or exceeds 8 MiB.');
    }
    if (options.output === '-') {
      process.stdout.write(bytes);
    } else {
      writeFileSync(options.output, bytes, { flag: 'w' });
    }
  });
  return command;
};

export const AGENT_COMMAND_NAMES = Object.freeze([
  'create',
  'run',
  'propose',
  'plan',
  'cancel',
  'recover',
  'approve',
  'reject',
  'inspect',
  'export',
] as const);

export const createAgentCommand = (): Command =>
  new Command('agent')
    .description(
      'Verified Agent Task/Run product loop; no command bypasses human approval'
    )
    .addCommand(createTaskCommand())
    .addCommand(createRunCommand())
    .addCommand(createProposalInspectionCommand('propose', 'preview'))
    .addCommand(createProposalInspectionCommand('plan', 'planning'))
    .addCommand(createRunIntentCommand('cancel'))
    .addCommand(createRunIntentCommand('recover'))
    .addCommand(createDecisionCommand('approved'))
    .addCommand(createDecisionCommand('rejected'))
    .addCommand(createInspectCommand())
    .addCommand(createAuditCommand());
