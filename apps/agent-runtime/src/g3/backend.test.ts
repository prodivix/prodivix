import { describe, expect, it, vi } from 'vitest';
import { digestVerificationValue } from '@prodivix/verification';
import { createDriverBackendPort } from '#src/g3/backend.js';
import { driverServiceFixture } from '#src/g3/serviceFixture.js';
import type { DriverCoordinates } from '#src/g3/contract.js';

const fixture = driverServiceFixture('g3-backend-contract-state');
const coordinates: DriverCoordinates = {
  taskId: fixture.execution.taskId,
  agentRunId: fixture.execution.agentRunId,
  authority: fixture.execution.authority,
  verificationRunId: fixture.run.runId,
  planDigest: fixture.plan.planDigest,
  requestDigest: digestVerificationValue('immutable-execution'),
};
const receipt = {
  cleaned: true,
  verificationRunId: coordinates.verificationRunId,
  requestDigest: coordinates.requestDigest,
};
const cleanupWithReceipt = (body: unknown) => {
  const fetcher = vi.fn(async () => Response.json(body));
  const backend = createDriverBackendPort(fixture.config, {
    fetch: fetcher,
    environment: {
      G3_BACKEND_CREDENTIAL: 'backend-transport-credential-canary',
    },
  });
  return backend.cleanup(
    fixture.workspace.id,
    coordinates,
    true,
    new AbortController().signal,
    '2026-10-01T00:00:02.000Z'
  );
};

describe('ordinary G3 Backend cleanup owner ACK', () => {
  it.each([receipt, { ...receipt, started: false }])(
    'accepts an exact canonical cleanup acknowledgement',
    async (body) => {
      await expect(cleanupWithReceipt(body)).resolves.toBeUndefined();
    }
  );
  it.each([
    {},
    { ...receipt, cleaned: false },
    { ...receipt, verificationRunId: 'verification:another-run' },
    { ...receipt, requestDigest: digestVerificationValue('foreign-execution') },
    { ...receipt, started: true },
    { ...receipt, unknownProof: true },
  ])(
    'rejects a successful HTTP response without exact owner proof',
    async (body) => {
      await expect(cleanupWithReceipt(body)).rejects.toThrow();
    }
  );
});
