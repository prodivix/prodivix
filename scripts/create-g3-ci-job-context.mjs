import { writeFile } from 'node:fs/promises';
import {
  assessVerificationCiPromotion,
  createVerificationCiJobContext,
  digestVerificationValue,
  encodeVerificationCiJobContext,
  serializeVerificationValue,
} from '../packages/verification/dist/index.js';

const MAXIMUM_OIDC_RESPONSE_BYTES = 256 * 1024;
const EXPECTED_AUDIENCE = 'prodivix-verification';

const requiredEnvironment = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new TypeError(`Missing required CI environment ${name}.`);
  return value;
};

const readBoundedStdin = async () => {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > MAXIMUM_OIDC_RESPONSE_BYTES) {
      throw new TypeError('GitHub OIDC response exceeds the bounded input.');
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
};

const parseJwtPayload = (token) => {
  const segments = token.split('.');
  if (segments.length !== 3 || segments.some((segment) => !segment)) {
    throw new TypeError('GitHub OIDC response is not a compact JWT.');
  }
  const bytes = Buffer.from(segments[1], 'base64url');
  if (bytes.byteLength < 2 || bytes.byteLength > MAXIMUM_OIDC_RESPONSE_BYTES) {
    throw new TypeError('GitHub OIDC claims exceed the bounded input.');
  }
  const value = JSON.parse(bytes.toString('utf8'));
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('GitHub OIDC claims must be a JSON object.');
  }
  return value;
};

const claimText = (claims, name) => {
  const value = claims[name];
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 2_048 ||
    value !== value.trim()
  ) {
    throw new TypeError(`GitHub OIDC claim ${name} is invalid.`);
  }
  return value;
};

const assertClaim = (claims, name, expected) => {
  const observed = claimText(claims, name);
  if (observed !== expected) {
    throw new TypeError(`GitHub OIDC claim ${name} does not match the job.`);
  }
  return observed;
};

const main = async () => {
  const outputPath = process.argv[2]?.trim();
  if (!outputPath) {
    throw new TypeError('Expected an output path for the CI job context.');
  }
  const responseText = await readBoundedStdin();
  const response = JSON.parse(responseText);
  const token =
    response !== null &&
    typeof response === 'object' &&
    !Array.isArray(response) &&
    typeof response.value === 'string'
      ? response.value
      : undefined;
  if (!token || token.length > MAXIMUM_OIDC_RESPONSE_BYTES) {
    throw new TypeError('GitHub OIDC endpoint omitted its bounded token.');
  }
  const claims = parseJwtPayload(token);
  const repository = requiredEnvironment('GITHUB_REPOSITORY');
  const ref = requiredEnvironment('GITHUB_REF');
  const commit = requiredEnvironment('GITHUB_SHA');
  const event = requiredEnvironment('GITHUB_EVENT_NAME');
  const runId = requiredEnvironment('GITHUB_RUN_ID');
  const runAttemptText = requiredEnvironment('GITHUB_RUN_ATTEMPT');
  const jobId = requiredEnvironment('GITHUB_JOB');
  const workflowRef = requiredEnvironment('GITHUB_WORKFLOW_REF');
  if (
    (event !== 'push' && event !== 'workflow_dispatch') ||
    !/^[a-f0-9]{40}$/u.test(commit) ||
    !/^[0-9]+$/u.test(runId) ||
    !/^[1-9][0-9]*$/u.test(runAttemptText)
  ) {
    throw new TypeError('GitHub job is not a trusted bounded CI identity.');
  }
  assertClaim(
    claims,
    'iss',
    'https://token.actions.githubusercontent.com'
  );
  assertClaim(claims, 'repository', repository);
  assertClaim(claims, 'ref', ref);
  assertClaim(claims, 'sha', commit);
  assertClaim(claims, 'event_name', event);
  assertClaim(claims, 'run_id', runId);
  assertClaim(claims, 'run_attempt', runAttemptText);
  assertClaim(claims, 'workflow_ref', workflowRef);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    audiences.length < 1 ||
    audiences.some((audience) => typeof audience !== 'string') ||
    !audiences.includes(EXPECTED_AUDIENCE)
  ) {
    throw new TypeError('GitHub OIDC audience does not admit Verification.');
  }
  const context = createVerificationCiJobContext({
    identity: {
      repository: `github:${repository}`,
      ref,
      commit: `sha1-${commit}`,
    },
    event,
    sourceRepository: `github:${repository}`,
    runId,
    runAttempt: Number(runAttemptText),
    jobId,
    workflowRef,
    oidc: {
      issuer: claimText(claims, 'iss'),
      audience: EXPECTED_AUDIENCE,
      subject: claimText(claims, 'sub'),
      workflowRef: claimText(claims, 'workflow_ref'),
      claimsDigest: digestVerificationValue({
        issuer: claims.iss,
        audience: audiences,
        subject: claims.sub,
        repository: claims.repository,
        ref: claims.ref,
        commit: claims.sha,
        event: claims.event_name,
        runId: claims.run_id,
        runAttempt: claims.run_attempt,
        workflowRef: claims.workflow_ref,
      }),
      proofDigest: digestVerificationValue(token),
      verifiedAt: new Date().toISOString(),
    },
  });
  const admission = assessVerificationCiPromotion(
    context,
    EXPECTED_AUDIENCE
  );
  if (admission.status !== 'allowed') {
    throw new TypeError(
      `GitHub CI job is not eligible for promotion: ${admission.reason}.`
    );
  }
  await writeFile(
    outputPath,
    `${serializeVerificationValue(encodeVerificationCiJobContext(context))}\n`,
    { encoding: 'utf8', flag: 'wx', mode: 0o600 }
  );
  process.stdout.write(`CI job context ${context.contextDigest}\n`);
};

await main();
