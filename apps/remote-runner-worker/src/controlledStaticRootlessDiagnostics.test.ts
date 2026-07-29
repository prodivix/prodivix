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
      failureCode: 'ERR_PNPM_NO_OFFLINE_META',
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
      packageSeed: null,
    });
  });

  it('ignores malformed command facts while retaining the fixed phase', () => {
    const encoded = Buffer.from(
      JSON.stringify({
        exitCode: 1,
        signal: null,
        timedOut: false,
        failureCode: 'EACCES',
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
      packageSeed: null,
    });
  });

  it('projects only bounded package-seed phase and filesystem facts', () => {
    const packageSeed = {
      phase: 'lock-validation-postcondition',
      failureCode: 'ENOSPC',
    };
    const encoded = Buffer.from(JSON.stringify(packageSeed), 'utf8').toString(
      'base64'
    );

    expect(
      decodeControlledStaticRootlessSandboxFailureFacts(
        envelope(
          `PRODIVIX_CONTROLLED_ROOTLESS_STAGE_FAILURE:package-seed\nPRODIVIX_CONTROLLED_ROOTLESS_PACKAGE_SEED_FAILURE:${encoded}\n`
        )
      )
    ).toEqual({
      exitCode: 1,
      innerPhase: 'package-seed',
      commandAuthority: null,
      packageSeed,
    });
  });

  it('rejects package-seed paths and messages from diagnostics', () => {
    const encoded = Buffer.from(
      JSON.stringify({
        phase: 'archive-rehash',
        failureCode: null,
        path: '/opt/prodivix/package-seeds/react-vite',
      }),
      'utf8'
    ).toString('base64');

    expect(
      decodeControlledStaticRootlessSandboxFailureFacts(
        envelope(
          `PRODIVIX_CONTROLLED_ROOTLESS_STAGE_FAILURE:package-seed\nPRODIVIX_CONTROLLED_ROOTLESS_PACKAGE_SEED_FAILURE:${encoded}\n`
        )
      )
    ).toEqual({
      exitCode: 1,
      innerPhase: 'package-seed',
      commandAuthority: null,
      packageSeed: null,
    });
  });
});
