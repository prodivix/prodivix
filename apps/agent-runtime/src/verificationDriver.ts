import {
  isAgentControlIdentity,
  digestAgentCanonicalValue,
  type AgentTaskRecord,
} from '@prodivix/ai';
import {
  encodeVerificationPlan,
  encodeVerificationRunSnapshot,
  type VerificationPlan,
  type VerificationRunSnapshot,
} from '@prodivix/verification';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import type { AgentRuntimeBinding } from '#src/config.js';
import type { RuntimeAuthority } from '#src/ports.js';
import {
  abortableRuntimeTransport,
  readBoundedRuntimeJSON,
} from '#src/transport.js';

export interface AgentRuntimeVerificationDriver {
  preflight(
    input: {
      binding: AgentRuntimeBinding;
      plan: VerificationPlan;
      task: AgentTaskRecord;
      workspace: WorkspaceSnapshot;
      agentRunId: string;
      authority: RuntimeAuthority;
    },
    signal?: AbortSignal
  ): Promise<void>;
  dispatch(
    input: {
      binding: AgentRuntimeBinding;
      task: AgentTaskRecord;
      workspace: WorkspaceSnapshot;
      run: VerificationRunSnapshot;
      plan: VerificationPlan;
      agentRunId: string;
      authority: RuntimeAuthority;
    },
    signal?: AbortSignal
  ): Promise<void>;
  cancel(
    input: {
      binding: AgentRuntimeBinding;
      task: AgentTaskRecord;
      run: VerificationRunSnapshot;
      plan: VerificationPlan;
      agentRunId: string;
      authority?: RuntimeAuthority;
      cancellationCommandId?: string;
    },
    signal?: AbortSignal
  ): Promise<void>;
}

/** Dispatch acknowledgment is only a transport receipt; canonical G3 Evidence must arrive separately. */
export const createAgentRuntimeVerificationDriver = (
  options: {
    environment?: NodeJS.ProcessEnv;
    fetch?: typeof fetch;
  } = {}
): AgentRuntimeVerificationDriver => {
  const validate = ({
    binding,
    plan,
  }: {
    binding: AgentRuntimeBinding;
    plan: VerificationPlan;
  }) => {
    const driver = binding.verificationDriver;
    if (
      !driver ||
      !binding.verification ||
      !isAgentControlIdentity(driver.providerId) ||
      driver.adapterRegistryDigest !== plan.adapterRegistryDigest ||
      !/^[A-Z][A-Z0-9_]{0,127}$/u.test(driver.credentialEnvironmentVariable) ||
      !Number.isSafeInteger(driver.maximumRuntimeMs) ||
      driver.maximumRuntimeMs < 1_000 ||
      driver.maximumRuntimeMs > 300_000 ||
      !plan.cells.some(({ requirement }) => requirement === 'required') ||
      plan.cells.some(
        ({ requirement, preflight: cell }) =>
          requirement === 'required' && cell.status !== 'supported'
      )
    )
      throw new Error('AI-6001');
    const endpoint = new URL(driver.endpoint);
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      !binding.grant.secretRefs.some(
        (ref) =>
          ref.kind === 'environment' &&
          ref.referenceId === driver.credentialEnvironmentVariable &&
          ref.purpose === 'verification-execution'
      ) ||
      binding.policy.layers.some(({ policy }) => {
        const rules = policy.secretRules.filter(
          (rule) =>
            rule.referenceKinds.includes('environment') &&
            rule.purposes.includes('verification-execution') &&
            rule.runtimeZones.includes('server')
        );
        const networks = policy.networkRules.filter(
          (rule) =>
            rule.hosts.includes(endpoint.hostname) &&
            rule.methods.includes('POST')
        );
        return (
          !rules.some(({ effect }) => effect === 'allow') ||
          rules.some(({ effect }) => effect === 'deny') ||
          !networks.some(
            ({ effect, tls, redirectPolicy }) =>
              effect === 'allow' &&
              tls === 'required' &&
              redirectPolicy === 'deny'
          ) ||
          networks.some(({ effect }) => effect === 'deny')
        );
      })
    )
      throw new Error('AI-7001');
    const credential = (options.environment ?? process.env)[
      driver.credentialEnvironmentVariable
    ];
    if (!credential || credential.length < 8 || /[\r\n]/u.test(credential))
      throw new Error('AI-7001');
  };
  const send = async (
    input: {
      binding: AgentRuntimeBinding;
      plan: VerificationPlan;
    },
    payload: unknown,
    signal?: AbortSignal
  ) => {
    validate(input);
    const driver = input.binding.verificationDriver!;
    const endpoint = new URL(driver.endpoint);
    const body = canonicalJsonText(payload);
    const requestDigest = digestAgentCanonicalValue(payload);
    const networks = input.binding.policy.layers.flatMap(({ policy }) =>
      policy.networkRules.filter(
        (rule) =>
          rule.hosts.includes(endpoint.hostname) &&
          rule.methods.includes('POST') &&
          rule.effect === 'allow'
      )
    );
    if (
      networks.some(
        ({ maxRequestBytes }) => Buffer.byteLength(body) > maxRequestBytes
      )
    )
      throw new Error('AI-7001');
    const credential = (options.environment ?? process.env)[
      driver.credentialEnvironmentVariable
    ]!;
    if (credential.length < 8 || /[\r\n]/u.test(credential))
      throw new Error('AI-7001');
    const headers = new Headers({
      Authorization: `Bearer ${credential}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timer = setTimeout(abort, 15_000);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    try {
      const response = await abortableRuntimeTransport(
        (options.fetch ?? fetch)(endpoint, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
          redirect: 'error',
        }),
        controller.signal
      );
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        throw new Error('AI-6001');
      }
      const receipt = await readBoundedRuntimeJSON(
        response,
        controller.signal,
        Math.min(
          262_144,
          ...networks.map(({ maxResponseBytes }) => maxResponseBytes)
        )
      );
      if (
        !isPlainObject(receipt) ||
        receipt.accepted !== true ||
        receipt.requestDigest !== requestDigest ||
        receipt.providerId !== driver.providerId
      )
        throw new Error('AI-6001');
      return receipt;
    } finally {
      headers.delete('Authorization');
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  };
  const sendRun = async (
    input:
      | Parameters<AgentRuntimeVerificationDriver['dispatch']>[0]
      | Parameters<AgentRuntimeVerificationDriver['cancel']>[0],
    payload: unknown,
    signal?: AbortSignal
  ) => {
    const receipt = await send(input, payload, signal);
    if (
      Object.keys(receipt).some(
        (key) =>
          ![
            'accepted',
            'requestDigest',
            'verificationRunId',
            'planDigest',
            'providerId',
          ].includes(key)
      ) ||
      receipt.verificationRunId !== input.run.runId ||
      receipt.planDigest !== input.plan.planDigest
    )
      throw new Error('AI-6001');
  };
  return {
    async preflight(input, signal) {
      const receipt = await send(
        input,
        {
          contract: 'prodivix.agent-runtime-g3-preflight',
          taskId: input.task.spec.taskId,
          agentRunId: input.agentRunId,
          authority: input.authority,
          workspace: input.workspace,
          plan: encodeVerificationPlan(input.plan),
        },
        signal
      );
      if (
        Object.keys(receipt).some(
          (key) =>
            ![
              'accepted',
              'requestDigest',
              'providerId',
              'adapterRegistryDigest',
              'checkKinds',
              'resourcesReady',
            ].includes(key)
        ) ||
        receipt.resourcesReady !== true ||
        receipt.adapterRegistryDigest !== input.plan.adapterRegistryDigest ||
        !Array.isArray(receipt.checkKinds) ||
        new Set(receipt.checkKinds).size !== receipt.checkKinds.length ||
        input.plan.cells.some(
          ({ checkKind, requirement }) =>
            requirement === 'required' &&
            !(receipt.checkKinds as unknown[]).includes(checkKind)
        )
      )
        throw new Error('AI-6001');
    },
    dispatch: (input, signal) =>
      sendRun(
        input,
        {
          contract: 'prodivix.agent-runtime-g3-execution',
          taskId: input.task.spec.taskId,
          agentRunId: input.agentRunId,
          authority: input.authority,
          workspace: input.workspace,
          plan: encodeVerificationPlan(input.plan),
          run: encodeVerificationRunSnapshot(input.run),
        },
        signal
      ),
    cancel: (input, signal) =>
      sendRun(
        input,
        {
          contract: 'prodivix.agent-runtime-g3-cancellation',
          taskId: input.task.spec.taskId,
          agentRunId: input.agentRunId,
          workspaceId: input.task.spec.workspaceId,
          ...(input.authority ? { authority: input.authority } : {}),
          ...(input.cancellationCommandId
            ? { cancellationCommandId: input.cancellationCommandId }
            : {}),
          verificationRunId: input.run.runId,
          planDigest: input.plan.planDigest,
        },
        signal
      ),
  };
};
