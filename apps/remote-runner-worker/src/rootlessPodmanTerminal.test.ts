import { describe, expect, it } from 'vitest';
import {
  createRootlessPodmanTerminalExecArguments,
  createRootlessPodmanTerminalProcess,
} from './rootlessPodmanTerminal';

describe('rootless Podman Terminal adapter', () => {
  it('uses an inner PTY without exposing the session identity or host TTY', () => {
    const args = createRootlessPodmanTerminalExecArguments({
      containerName: 'prodivix-execution-1',
      terminalSessionId: 'sensitive-session-identity',
      size: { columns: 100, rows: 30 },
    });
    expect(args).toContain('--interactive');
    expect(args).not.toContain('--tty');
    expect(args).toContain('--workdir=/workspace');
    expect(args).toContain('--env=PRODIVIX_TERMINAL_COLUMNS=100');
    expect(args).toContain('--env=PRODIVIX_TERMINAL_ROWS=30');
    expect(args.at(-1)).toBe('/opt/prodivix/terminal-entry.sh');
    expect(args.join(' ')).not.toContain('sensitive-session-identity');
  });

  it('rejects an unsafe container identity before spawning Podman', () => {
    expect(() =>
      createRootlessPodmanTerminalProcess({
        podmanCommand: 'podman',
        containerName: '../host',
        environment: {},
      })
    ).toThrow(/container name/u);
  });
});
