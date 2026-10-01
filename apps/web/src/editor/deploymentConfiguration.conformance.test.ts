import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), '../..', path), 'utf8');
const compose = read('deploy/docker-compose.ghcr.yml');
const nginx = read('apps/web/docker/nginx.conf');
const dockerfile = read('apps/backend/Dockerfile');

describe('production deployment persistence and account recovery', () => {
  it('persists verification bytes at the explicitly configured backend root', () => {
    expect(compose).toContain(
      'BACKEND_VERIFICATION_ARTIFACT_ROOT: /app/data/verification'
    );
    expect(compose).toContain(
      '- verification-artifacts:/app/data/verification'
    );
    expect(compose).toMatch(/^ {2}verification-artifacts:$/m);
    expect(dockerfile).toMatch(/mkdir -p[^\n]*\/app\/data\/verification/);
    expect(dockerfile).toContain('chown -R app:app /app/data');
  });

  it('keeps uploaded avatars in a volume initialized for the non-root backend user', () => {
    expect(compose).toContain('- avatar-uploads:/app/data/uploads');
    expect(compose).toMatch(/^ {2}avatar-uploads:$/m);
    expect(dockerfile).toMatch(/mkdir -p[^\n]*\/app\/data\/uploads/);
    expect(dockerfile).toContain('chown -R app:app /app/data');
    expect(dockerfile.indexOf('chown -R app:app /app/data')).toBeLessThan(
      dockerfile.indexOf('USER app')
    );
    expect(dockerfile).toContain('WORKDIR /app');
  });

  it('routes avatar bytes and misses to the backend without falling through to the editor', () => {
    const uploads = /location \/uploads\/ \{([^}]+)\}/.exec(nginx)?.[1];
    expect(uploads).toBeDefined();
    expect(uploads).toContain('proxy_pass http://backend:8080;');
    expect(uploads).not.toContain('try_files');
    expect(uploads).not.toContain('/index.html');
  });

  it('allows the bounded avatar multipart request without widening all API requests', () => {
    const avatar = /location = \/api\/users\/me\/avatar \{([^}]+)\}/.exec(
      nginx
    )?.[1];
    expect(avatar).toContain('client_max_body_size 3m;');
    expect(avatar).toContain('proxy_pass http://backend:8080;');
    expect(nginx.match(/client_max_body_size/g)).toHaveLength(1);
    expect(read('apps/backend/internal/modules/auth/handlers.go')).toContain(
      'maxAvatarRequestBytes = maxAvatarBytes + 64<<10'
    );
  });

  it('defaults browser mutations to both loopback hostnames at the selected web port', () => {
    expect(compose).toContain(
      '${BACKEND_ALLOWED_ORIGINS:-http://localhost:${WEB_PORT:-4173},http://127.0.0.1:${WEB_PORT:-4173}}'
    );
    expect(read('deploy/.env.example')).toMatch(/^BACKEND_ALLOWED_ORIGINS=$/m);
  });

  it('passes database credentials as fields to the backend configuration owner', () => {
    expect(compose).toContain("BACKEND_DB_URL: ''");
    expect(compose).not.toContain('postgres://${');
    expect(compose).toContain('BACKEND_DB_HOST: postgres');
    expect(compose).toContain("BACKEND_DB_PORT: '5432'");
    expect(compose).toContain('BACKEND_DB_USER: ${POSTGRES_USER:-postgres}');
    expect(compose).toContain(
      'BACKEND_DB_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}'
    );
    expect(compose).toContain('BACKEND_DB_NAME: ${POSTGRES_DB:-prodivix}');
    expect(compose).toContain('BACKEND_DB_SSLMODE: disable');
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
