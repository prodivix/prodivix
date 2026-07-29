import { describe, expect, it } from 'vitest';
import {
  EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT,
  EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_VERSION,
  normalizeExecutionAuthSessionFixtureResponse,
} from './executionAuthSessionFixture';

const digest = (character: string): string => `sha256-${character.repeat(64)}`;

const response = () => ({
  format: EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT,
  version: EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_VERSION,
  fixtureSetId: 'catalog-auth',
  fixtureSetDigest: digest('a'),
  fixtureId: 'catalog-owner',
  resourceId: 'prodivix-product-session',
  inputDigest: digest('b'),
  outcomeDigest: digest('c'),
  projectionDigest: digest('d'),
  providerId: 'prodivix-product-session',
  principalId: 'golden-catalog-owner',
  permissionIds: ['catalog.read', 'workspace.owner'],
  invocationId: 'browser-attempt:auth-session',
  attempt: 1,
});

describe('Execution Auth Session fixture response', () => {
  it('normalizes the exact bounded transport-neutral response', () => {
    expect(normalizeExecutionAuthSessionFixtureResponse(response())).toEqual(
      response()
    );
  });

  it.each([
    {
      label: 'unknown field',
      mutate: (value: ReturnType<typeof response>) => ({
        ...value,
        leaked: true,
      }),
    },
    {
      label: 'provider drift',
      mutate: (value: ReturnType<typeof response>) => ({
        ...value,
        providerId: 'other-provider',
      }),
    },
    {
      label: 'permission order drift',
      mutate: (value: ReturnType<typeof response>) => ({
        ...value,
        permissionIds: ['workspace.owner', 'catalog.read'],
      }),
    },
    {
      label: 'digest drift',
      mutate: (value: ReturnType<typeof response>) => ({
        ...value,
        outcomeDigest: 'not-a-digest',
      }),
    },
    {
      label: 'attempt drift',
      mutate: (value: ReturnType<typeof response>) => ({
        ...value,
        attempt: 0,
      }),
    },
    {
      label: 'response byte budget drift',
      mutate: (value: ReturnType<typeof response>) => ({
        ...value,
        permissionIds: Array.from(
          { length: 256 },
          (_, index) => `p${String(index).padStart(3, '0')}${'a'.repeat(252)}`
        ),
      }),
    },
  ])('rejects $label', ({ mutate }) => {
    expect(() =>
      normalizeExecutionAuthSessionFixtureResponse(mutate(response()))
    ).toThrow();
  });
});
