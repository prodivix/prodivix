import { readFileSync, writeFileSync } from 'node:fs';
import { Command } from 'commander';
import {
  createVerificationPlan,
  projectVerificationPlanExplanation,
  serializeVerificationValue,
  type CreateVerificationPlanInput,
  type VerificationClosure,
  type VerificationPlan,
} from '@prodivix/verification';

type JsonRecord = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const readJson = (path: string): unknown => {
  const text =
    path === '-' ? readFileSync(0, 'utf8') : readFileSync(path, 'utf8');
  return JSON.parse(text) as unknown;
};

const writeJson = (path: string, value: unknown): void => {
  const text = `${serializeVerificationValue(value)}\n`;
  if (path === '-') {
    process.stdout.write(text);
  } else {
    writeFileSync(path, text, 'utf8');
  }
};

const readPlanInput = (value: unknown): CreateVerificationPlanInput => {
  if (
    !isRecord(value) ||
    !isRecord(value.impactSet) ||
    !isRecord(value.policy) ||
    !Array.isArray(value.scenarios) ||
    !Array.isArray(value.checks) ||
    !Array.isArray(value.adapters) ||
    typeof value.policyEvaluationInstant !== 'string'
  ) {
    throw new Error(
      'Planning input must contain impactSet, policy, scenarios, checks, adapters, and policyEvaluationInstant.'
    );
  }
  return value as unknown as CreateVerificationPlanInput;
};

const readPlan = (value: unknown): VerificationPlan => {
  if (
    !isRecord(value) ||
    typeof value.planDigest !== 'string' ||
    !Array.isArray(value.cells) ||
    !Array.isArray(value.issues) ||
    !Array.isArray(value.explanations)
  ) {
    throw new Error('The supplied JSON is not a VerificationPlan.');
  }
  return value as unknown as VerificationPlan;
};

const readClosure = (value: unknown): VerificationClosure => {
  if (
    !isRecord(value) ||
    typeof value.closureDigest !== 'string' ||
    typeof value.planDigest !== 'string' ||
    !isRecord(value.cellStatuses)
  ) {
    throw new Error('The supplied JSON is not a VerificationClosure.');
  }
  return value as unknown as VerificationClosure;
};

export const createVerificationCommand = (): Command => {
  const verification = new Command('verification').description(
    'Create and explain canonical Verification plans'
  );
  verification
    .command('plan')
    .description('Create a deterministic VerificationPlan from canonical JSON')
    .requiredOption('-i, --input <path>', 'planning input JSON, or - for stdin')
    .option('-o, --output <path>', 'plan JSON, or - for stdout', '-')
    .action((options: Readonly<{ input: string; output: string }>) => {
      const result = createVerificationPlan(
        readPlanInput(readJson(options.input))
      );
      writeJson(options.output, result.plan);
      if (result.status === 'blocked') process.exitCode = 2;
    });
  verification
    .command('explain')
    .description('Project the shared Web/CLI/CI plan explanation JSON')
    .requiredOption('-p, --plan <path>', 'VerificationPlan JSON')
    .option('-c, --closure <path>', 'optional VerificationClosure JSON')
    .option('-o, --output <path>', 'explanation JSON, or - for stdout', '-')
    .action(
      (
        options: Readonly<{
          plan: string;
          closure?: string;
          output: string;
        }>
      ) => {
        const plan = readPlan(readJson(options.plan));
        const closure = options.closure
          ? readClosure(readJson(options.closure))
          : undefined;
        writeJson(
          options.output,
          projectVerificationPlanExplanation(plan, closure)
        );
      }
    );
  return verification;
};
