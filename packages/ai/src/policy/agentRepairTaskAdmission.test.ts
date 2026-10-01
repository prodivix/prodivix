import repairVector from '../../../../apps/backend/internal/platform/agentcontract/testdata/agent-repair-task-vector.json';
import { describe, expect, it } from 'vitest';
import { decodeAgentControlFact } from '../control/agentControlCodec';
import { createAgentTaskRecord } from '../control/agentTask';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import { decodeAgentVerificationFact } from '../verification/agentVerificationCodec';
import {
  decodeAgentRepairTaskRequest,
  encodeAgentRepairTaskRequest,
} from '../verification/agentRepairTask';
import {
  createAgentRepairTaskAdmissionInput,
  decodeAgentRepairTaskAdmission,
  type AgentRepairTaskAdmissionScope,
} from './agentRepairTaskAdmission';

const fixture = () => {
  const vector = structuredClone(repairVector);
  const task = decodeAgentControlFact(vector.parentTask);
  const run = decodeAgentControlFact(vector.parentRun);
  const closure = decodeAgentVerificationFact(vector.closureReceipt);
  const request = decodeAgentRepairTaskRequest(vector.request);
  if (
    !task.ok ||
    task.value.factType !== 'task-record' ||
    !run.ok ||
    run.value.factType !== 'run-snapshot' ||
    !closure.ok ||
    closure.value.factType !== 'verification-closure-receipt' ||
    !request.ok
  )
    throw new Error('Public repair vector is invalid.');
  const parentTask = task.value.value;
  const parentRun = run.value.value;
  const receipt = closure.value.value;
  const scope: AgentRepairTaskAdmissionScope = {
    projectId: parentTask.spec.projectId,
    workspaceId: parentTask.spec.workspaceId,
    actorId: parentTask.spec.actor.principalId,
    requestId: request.value.requestId,
    view: {
      identity: {
        projectId: parentTask.spec.projectId,
        workspaceId: parentTask.spec.workspaceId,
        taskId: parentTask.spec.taskId,
        taskDigest: parentTask.taskDigest,
        runId: parentRun.run.runId,
        runSnapshotDigest: parentRun.snapshotDigest,
        generation: parentRun.run.generation,
        attempt: parentRun.run.attempt,
        cursor: parentRun.cursor,
      },
      task: parentTask.spec,
      run: parentRun.run,
      cleanupState: parentRun.cleanupState,
      budgetLedger: parentRun.budgetLedger,
      verificationBindings: [
        {
          bindingId: receipt.bindingId,
          mutationKind: 'commit',
        } as AgentRepairTaskAdmissionScope['view']['verificationBindings'][number],
      ],
      verificationClosures: [receipt],
      availableActions: ['repair'],
    },
  };
  const response = {
    request: vector.request,
    admissionId: 'admission.repair.fixture',
    challengeDigest: digestAgentCanonicalValue('repair-admission'),
    status: 'pending',
  };
  return { scope, response, request: request.value };
};

describe('public repair admission transport binding', () => {
  it('binds a public derived Task to its original failure and reuses a stable retry identity', () => {
    const { scope, response, request } = fixture();
    expect(decodeAgentRepairTaskAdmission(response, scope).request).toEqual(
      request
    );
    const input = { ...scope, requestId: undefined };
    expect(createAgentRepairTaskAdmissionInput(input)).toEqual(
      createAgentRepairTaskAdmissionInput(input)
    );
    expect(createAgentRepairTaskAdmissionInput(scope)).toEqual({
      requestId: request.requestId,
      expectedParentSnapshotDigest: request.expectedParentSnapshotDigest,
      expectedClosureDigest: request.failedClosureDigest,
    });
  });

  it('keeps the forward failure after a later successful or failed rollback Closure', () => {
    const { scope } = fixture();
    const source = scope.view.verificationClosures[0];
    for (const verdict of ['satisfied', 'unsatisfied'] as const) {
      const view = {
        ...scope.view,
        verificationBindings: [
          ...scope.view.verificationBindings,
          {
            bindingId: 'binding.rollback',
            mutationKind: 'rollback',
          } as AgentRepairTaskAdmissionScope['view']['verificationBindings'][number],
        ],
        verificationClosures: [
          ...scope.view.verificationClosures,
          {
            ...source,
            bindingId: 'binding.rollback',
            verdict,
            closureDigest: digestAgentCanonicalValue('rollback'),
          },
        ],
      };
      expect(
        createAgentRepairTaskAdmissionInput({ ...scope, view })
          .expectedClosureDigest
      ).toBe(source.closureDigest);
    }
  });

  it.each([
    'actor',
    'project',
    'cleanup',
    'active',
    'succeeded',
    'missing-forward',
  ] as const)('refuses an unauthorized %s parent before transport', (kind) => {
    const { scope } = fixture();
    const invalid =
      kind === 'actor'
        ? { ...scope, actorId: 'other' }
        : kind === 'project'
          ? { ...scope, projectId: 'other' }
          : {
              ...scope,
              view: {
                ...scope.view,
                ...(kind === 'cleanup'
                  ? { cleanupState: 'residual' as const }
                  : kind === 'active'
                    ? {
                        run: { ...scope.view.run, phase: 'verifying' as const },
                      }
                    : kind === 'succeeded'
                      ? {
                          run: {
                            ...scope.view.run,
                            outcome: 'succeeded' as const,
                          },
                        }
                      : { verificationBindings: [] }),
              },
            };
    expect(() => createAgentRepairTaskAdmissionInput(invalid)).toThrow(
      /authenticated failed Task/u
    );
  });

  it.each([
    'unknown',
    'digest',
    'snapshot',
    'ledger',
    'actor',
    'scope',
  ] as const)('refuses drifted %s server material before admission', (kind) => {
    const { scope, response, request } = fixture();
    if (kind === 'unknown') {
      expect(() =>
        decodeAgentRepairTaskAdmission({ ...response, approval: true }, scope)
      ).toThrow(/malformed/u);
      return;
    }
    const requestedTask =
      kind === 'actor'
        ? createAgentTaskRecord(
            {
              ...request.requestedTask.spec,
              actor: { kind: 'user', principalId: 'other' },
            },
            { lineage: request.requestedTask.lineage }
          )
        : kind === 'scope'
          ? createAgentTaskRecord(
              {
                ...request.requestedTask.spec,
                targetScope: { targets: [{ kind: 'document', id: 'other' }] },
              },
              { lineage: request.requestedTask.lineage }
            )
          : request.requestedTask;
    const { requestDigest: _digest, ...body } = {
      ...request,
      requestedTask,
      ...(kind === 'snapshot'
        ? { expectedParentSnapshotDigest: digestAgentCanonicalValue('other') }
        : {}),
      ...(kind === 'ledger'
        ? { expectedParentLedgerDigest: digestAgentCanonicalValue('other') }
        : {}),
    };
    const forged = {
      ...body,
      requestDigest:
        kind === 'digest'
          ? digestAgentCanonicalValue('other')
          : digestAgentCanonicalValue(body),
    };
    const wire =
      kind === 'digest'
        ? {
            ...response.request,
            value: {
              ...response.request.value,
              requestDigest: forged.requestDigest,
            },
          }
        : encodeAgentRepairTaskRequest(forged);
    expect(() =>
      decodeAgentRepairTaskAdmission({ ...response, request: wire }, scope)
    ).toThrow(/strict validation|inspected failure/u);
  });
});
