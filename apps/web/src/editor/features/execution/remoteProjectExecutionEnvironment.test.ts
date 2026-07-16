import { describe, expect, it } from 'vitest';
import { createRemoteProjectExecutionEnvironment } from './remoteProjectExecutionEnvironment';

describe('Remote project execution composition', () => {
  it('requires the authenticated product session and exposes the canonical Preview provider', () => {
    expect(() =>
      createRemoteProjectExecutionEnvironment({
        accessToken: ' ',
        resolveSnapshot: async () => {
          throw new Error('not reached');
        },
      })
    ).toThrow('authenticated session');

    const environment = createRemoteProjectExecutionEnvironment({
      accessToken: 'user-session-token',
      resolveSnapshot: async () => {
        throw new Error('not started');
      },
    });
    expect(environment.provider.descriptor).toMatchObject({
      id: 'prodivix.remote.preview',
      profiles: ['preview'],
      isolation: 'remote-isolated',
    });
    expect(environment.artifacts.resolvePreviewBundle).toBeTypeOf('function');
  });
});
