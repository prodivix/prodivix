import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const bash =
  process.platform === 'win32'
    ? resolve(
        execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim(),
        '../../../bin/bash.exe'
      )
    : 'bash';
const helper = resolve(root, 'deploy/password-env.sh');

const run = (
  script: string,
  args: string[],
  env: Record<string, string> = {},
  input?: string
) =>
  execFileSync(bash, ['-c', script, '--', ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    input,
  });

const encode = (password: string) =>
  run('. "$1"; encode_postgres_password "$FIXTURE_PASSWORD"', [helper], {
    FIXTURE_PASSWORD: password,
  });

describe('deployment credential and origin configuration', () => {
  it.each([
    'ordinary-password',
    'space $dollar "double" \'single\' \\backslash/at@colon:percent%plus+=',
    'trailing-backslash\\',
    '密碼 and spaces',
  ])(
    'preserves a literal password through writing and decoding',
    (password) => {
      const encoded = encode(password);
      const decoded = run(
        '. "$1"; decode_postgres_password "$FIXTURE_ENCODED_PASSWORD"',
        [helper],
        { FIXTURE_ENCODED_PASSWORD: encoded }
      );
      expect(decoded).toBe(password);
      expect(encoded.startsWith('"') && encoded.endsWith('"')).toBe(true);
    }
  );

  it.each(['', 'line\nbreak', 'line\rbreak'])(
    'rejects passwords that cannot form a deployment credential record',
    (password) => {
      expect(() => encode(password)).toThrow();
    }
  );

  it.each(['"unterminated', '"single$dollar"', '"bad\\qescape"'])(
    'rejects malformed literal records without evaluating credential text',
    (value) => {
      expect(() =>
        run(
          '. "$1"; decode_postgres_password "$FIXTURE_ENCODED_PASSWORD"',
          [helper],
          {
            FIXTURE_ENCODED_PASSWORD: value,
          }
        )
      ).toThrow();
    }
  );

  it.each(['', 'https://editor.example.com'])(
    'reuses encoded passwords and preserves operator settings on repeated deployment',
    (origins) => {
      const directory = mkdtempSync(resolve(tmpdir(), 'prodivix-deploy-'));
      if (
        dirname(resolve(directory)) !== resolve(tmpdir()) ||
        !basename(directory).startsWith('prodivix-deploy-')
      ) {
        throw new Error('Deployment fixture escaped its temporary directory');
      }
      try {
        for (const file of [
          'start-app.sh',
          'password-env.sh',
          'docker-compose.ghcr.yml',
        ]) {
          copyFileSync(resolve(root, 'deploy', file), resolve(directory, file));
        }
        const bin = resolve(directory, 'bin');
        mkdirSync(bin);
        for (const name of ['docker', 'curl', 'sleep']) {
          const path = resolve(bin, name);
          writeFileSync(
            path,
            name === 'docker'
              ? '#!/usr/bin/env bash\nprintf \'%s\\n\' "$*" >> "$(dirname "$0")/../docker-calls"\nexit 0\n'
              : '#!/usr/bin/env bash\nexit 0\n'
          );
          chmodSync(path, 0o755);
        }
        const password = 'synthetic $dollar "double" \'single\' \\backslash/@%';
        const credential = `POSTGRES_PASSWORD=${encode(password)}`;
        const smtp = 'BACKEND_SMTP_PASSWORD=operator-managed-test-password';
        writeFileSync(
          resolve(directory, '.env'),
          [
            credential,
            'WEB_PORT=4317',
            `BACKEND_ALLOWED_ORIGINS=${origins}`,
            `BACKEND_VERIFICATION_RESUME_KEY=${Buffer.alloc(32, 17).toString('base64')}`,
            smtp,
            '',
          ].join('\n')
        );
        for (let attempt = 0; attempt < 2; attempt++) {
          run(
            'export PATH="$(cd "$1" && pwd):$PATH"; exec "$BASH" "$2" --skip-pull --skip-down ${3:+--yes}',
            [
              bin,
              resolve(directory, 'start-app.sh'),
              attempt === 0 ? '' : '--yes',
            ],
            {},
            attempt === 0
              ? [
                  '',
                  '',
                  '4327',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                  '',
                ].join('\n')
              : undefined
          );
          const env = readFileSync(resolve(directory, '.env'), 'utf8');
          expect(env.split('\n')).toContain('GHCR_NAMESPACE=prodivix');
          expect(env.split('\n')).toContain(credential);
          expect(env.split('\n')).toContain(smtp);
          expect(env.split('\n')).toContain(
            `BACKEND_ALLOWED_ORIGINS=${origins || 'http://localhost:4327,http://127.0.0.1:4327'}`
          );
          expect(
            readFileSync(resolve(directory, 'docker-calls'), 'utf8')
          ).not.toMatch(/^login\b/m);
        }
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  );
});
