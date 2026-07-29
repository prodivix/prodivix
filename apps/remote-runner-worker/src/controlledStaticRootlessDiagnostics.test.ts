import { describe, expect, it } from 'vitest';
import { decodeControlledStaticRootlessSandboxFailureFacts } from '../scripts/controlledStaticRootlessPodmanStageController';

const envelope = (stderr: string): Buffer =>
  Buffer.from(
    JSON.stringify({
      exitCode: 1,
      stderr: Buffer.from(stderr, 'utf8').toString('base64'),
    }),
    'utf8'
  );

describe('controlled static rootless failure diagnostics', () => {
  it('projects only bounded command authority facts', () => {
    const commandAuthority = {
      exitCode: 1,
      signal: null,
      timedOut: false,
      stdoutByteLength: 0,
      stdoutCapturedByteLength: 0,
      stdoutTruncated: false,
      stderrByteLength: 192,
      stderrCapturedByteLength: 192,
      stderrTruncated: false,
    };
    const encoded = Buffer.from(
      JSON.stringify(commandAuthority),
      'utf8'
    ).toString('base64');

    expect(
      decodeControlledStaticRootlessSandboxFailureFacts(
        envelope(
          `PRODIVIX_CONTROLLED_ROOTLESS_STAGE_FAILURE:command-authority\nPRODIVIX_CONTROLLED_ROOTLESS_COMMAND_AUTHORITY_FAILURE:${encoded}\n`
        )
      )
    ).toEqual({
      exitCode: 1,
      innerPhase: 'command-authority',
      commandAuthority,
    });
  });

  it('ignores malformed command facts while retaining the fixed phase', () => {
    const encoded = Buffer.from(
      JSON.stringify({
        exitCode: 1,
        signal: null,
        timedOut: false,
        stdoutByteLength: 0,
        stdoutCapturedByteLength: 0,
        stdoutTruncated: false,
        stderrByteLength: 192,
        stderrCapturedByteLength: 192,
        stderrTruncated: false,
        source: 'must-not-project',
      }),
      'utf8'
    ).toString('base64');

    expect(
      decodeControlledStaticRootlessSandboxFailureFacts(
        envelope(
          `PRODIVIX_CONTROLLED_ROOTLESS_STAGE_FAILURE:command-authority\nPRODIVIX_CONTROLLED_ROOTLESS_COMMAND_AUTHORITY_FAILURE:${encoded}\n`
        )
      )
    ).toEqual({
      exitCode: 1,
      innerPhase: 'command-authority',
      commandAuthority: null,
    });
  });
});
