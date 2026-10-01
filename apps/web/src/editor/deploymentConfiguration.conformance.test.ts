import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), '../..', path), 'utf8');
const compose = read('deploy/docker-compose.ghcr.yml');

describe('production deployment persistence and account recovery', () => {
  it('persists verification bytes at the explicitly configured backend root', () => {
    expect(compose).toContain(
      'BACKEND_VERIFICATION_ARTIFACT_ROOT: /app/data/verification'
    );
    expect(compose).toContain(
      '- verification-artifacts:/app/data/verification'
    );
    expect(compose).toMatch(/^ {2}verification-artifacts:$/m);
    expect(read('apps/backend/Dockerfile')).toContain(
      'mkdir -p /app/data/verification && chown -R app:app /app/data'
    );
  });

  it.each([
    'PASSWORD_RESET_URL',
    'PASSWORD_RESET_TTL',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_FROM',
    'SMTP_USERNAME',
    'SMTP_PASSWORD',
    'SMTP_TLS_MODE',
  ])('forwards BACKEND_%s without erasing operator configuration', (suffix) => {
    const name = `BACKEND_${suffix}`;
    expect(compose).toContain(`${name}: \${${name}:-`);
    expect(read('deploy/.env.example')).toMatch(new RegExp(`^${name}=`, 'm'));
    const script = read('deploy/start-app.sh');
    expect(script).toContain('reset_settings="$(grep -E');
    expect(script).toMatch(/^\$reset_settings\r?$/m);
  });
});
