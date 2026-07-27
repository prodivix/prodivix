import Ajv2020, {
  type ErrorObject,
  type ValidateFunction,
} from 'ajv/dist/2020.js';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import type {
  BehaviorControlProfile,
  BehaviorDecodeIssue,
  BehaviorDecodeResult,
  BehaviorDocumentByKind,
  BehaviorDocumentDigestRef,
  BehaviorDocumentKind,
  BehaviorFixtureSet,
  BehaviorScenario,
  BehaviorStep,
  BehaviorWireDocument,
} from './behavior.types';
import {
  behaviorControlProfileWireSchema,
  behaviorFixtureSetWireSchema,
  behaviorScenarioWireSchema,
} from './wire';

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  validateFormats: false,
});

const validators: Readonly<Record<BehaviorDocumentKind, ValidateFunction>> = {
  'behavior-scenario': ajv.compile(behaviorScenarioWireSchema),
  'behavior-control-profile': ajv.compile(behaviorControlProfileWireSchema),
  'behavior-fixture-set': ajv.compile(behaviorFixtureSetWireSchema),
};

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const issuePath = (error: ErrorObject): string =>
  error.instancePath ||
  (error.params && 'missingProperty' in error.params
    ? `/${String(error.params.missingProperty)}`
    : '/');

const schemaIssues = (
  errors: ErrorObject[] | null | undefined
): BehaviorDecodeIssue[] =>
  (errors ?? []).map((error) => ({
    code: 'BHV-1001',
    path: issuePath(error),
    message: error.message
      ? `Behavior document ${error.message}.`
      : 'Behavior document does not match its wire schema.',
  }));

const customIssue = (path: string, message: string): BehaviorDecodeIssue => ({
  code: 'BHV-1001',
  path,
  message,
});

const compareDocumentRefs = (
  left: BehaviorDocumentDigestRef,
  right: BehaviorDocumentDigestRef
): number => compareUnicodeCodePoints(left.documentId, right.documentId);

const normalizeStep = (step: BehaviorStep): BehaviorStep =>
  step.kind === 'parallel'
    ? {
        ...step,
        steps: step.steps.map(normalizeStep),
      }
    : step.kind === 'barrier'
      ? {
          ...step,
          participantStepIds: [...step.participantStepIds].sort(
            compareUnicodeCodePoints
          ),
        }
      : cloneJson(step);

export const normalizeBehaviorScenario = (
  scenario: BehaviorScenario
): BehaviorScenario => ({
  ...cloneJson(scenario),
  tags: [...scenario.tags].sort(compareUnicodeCodePoints),
  steps: scenario.steps.map(normalizeStep),
  fixtureRefs: [...scenario.fixtureRefs]
    .map(cloneJson)
    .sort(compareDocumentRefs),
  baselineRefs: [...scenario.baselineRefs]
    .map(cloneJson)
    .sort(compareDocumentRefs),
});

export const normalizeBehaviorControlProfile = (
  profile: BehaviorControlProfile
): BehaviorControlProfile => ({
  ...cloneJson(profile),
  identifiers: {
    ...cloneJson(profile.identifiers),
    namespaces: [...profile.identifiers.namespaces].sort(
      compareUnicodeCodePoints
    ),
  },
  storage: {
    ...cloneJson(profile.storage),
    bootstrapFixtureIds: [...profile.storage.bootstrapFixtureIds].sort(
      compareUnicodeCodePoints
    ),
  },
  settle: {
    ...cloneJson(profile.settle),
    conditions: [...profile.settle.conditions].sort(compareUnicodeCodePoints),
  },
});

export const normalizeBehaviorFixtureSet = (
  fixtureSet: BehaviorFixtureSet
): BehaviorFixtureSet => ({
  ...cloneJson(fixtureSet),
  fixtures: [...fixtureSet.fixtures]
    .map(cloneJson)
    .sort((left, right) => compareUnicodeCodePoints(left.id, right.id)),
});

const normalizeByKind = <K extends BehaviorDocumentKind>(
  kind: K,
  value: BehaviorDocumentByKind[K]
): BehaviorDocumentByKind[K] => {
  if (kind === 'behavior-scenario') {
    return normalizeBehaviorScenario(
      value as BehaviorScenario
    ) as BehaviorDocumentByKind[K];
  }
  if (kind === 'behavior-control-profile') {
    return normalizeBehaviorControlProfile(
      value as BehaviorControlProfile
    ) as BehaviorDocumentByKind[K];
  }
  return normalizeBehaviorFixtureSet(
    value as BehaviorFixtureSet
  ) as BehaviorDocumentByKind[K];
};

const collectScenarioIdentityIssues = (
  scenario: BehaviorScenario
): BehaviorDecodeIssue[] => {
  const issues: BehaviorDecodeIssue[] = [];
  const stepIds = new Set<string>();
  const assertionIds = new Set<string>();
  const barriers: Array<
    Readonly<{ step: Extract<BehaviorStep, { kind: 'barrier' }>; path: string }>
  > = [];

  const visit = (steps: readonly BehaviorStep[], parentPath: string) => {
    steps.forEach((step, index) => {
      const path = `${parentPath}/${index}`;
      if (stepIds.has(step.id)) {
        issues.push(
          customIssue(`${path}/id`, `Duplicate BehaviorStep id: ${step.id}.`)
        );
      }
      stepIds.add(step.id);
      if (step.kind === 'observation') {
        step.assertions.forEach((assertion, assertionIndex) => {
          if (assertionIds.has(assertion.id)) {
            issues.push(
              customIssue(
                `${path}/assertions/${assertionIndex}/id`,
                `Duplicate Behavior assertion id: ${assertion.id}.`
              )
            );
          }
          assertionIds.add(assertion.id);
          if (assertion.operator === 'custom' && !assertion.codeReferenceId) {
            issues.push(
              customIssue(
                `${path}/assertions/${assertionIndex}/codeReferenceId`,
                'Custom assertions require a revision-bound CodeReference id.'
              )
            );
          }
        });
      } else if (step.kind === 'parallel') {
        visit(step.steps, `${path}/steps`);
      } else if (step.kind === 'barrier') {
        barriers.push({ step, path });
      }
    });
  };

  visit(scenario.steps, '/steps');
  barriers.forEach(({ step, path }) => {
    step.participantStepIds.forEach((participantId, index) => {
      if (!stepIds.has(participantId) || participantId === step.id) {
        issues.push(
          customIssue(
            `${path}/participantStepIds/${index}`,
            `Barrier participant must reference another BehaviorStep: ${participantId}.`
          )
        );
      }
    });
  });

  if (scenario.timeoutPolicy.stepMs > scenario.timeoutPolicy.totalMs) {
    issues.push(
      customIssue(
        '/timeoutPolicy/stepMs',
        'Step timeout cannot exceed the Scenario total timeout.'
      )
    );
  }
  if (scenario.timeoutPolicy.settleMs > scenario.timeoutPolicy.totalMs) {
    issues.push(
      customIssue(
        '/timeoutPolicy/settleMs',
        'Settle timeout cannot exceed the Scenario total timeout.'
      )
    );
  }
  return issues;
};

const collectFixtureIdentityIssues = (
  fixtureSet: BehaviorFixtureSet
): BehaviorDecodeIssue[] => {
  const ids = new Set<string>();
  const issues: BehaviorDecodeIssue[] = [];
  fixtureSet.fixtures.forEach((fixture, index) => {
    if (ids.has(fixture.id)) {
      issues.push(
        customIssue(
          `/fixtures/${index}/id`,
          `Duplicate fixture id: ${fixture.id}.`
        )
      );
    }
    ids.add(fixture.id);
  });
  return issues;
};

const validateEncoded = <K extends BehaviorDocumentKind>(
  kind: K,
  value: unknown
): BehaviorDecodeResult<BehaviorDocumentByKind[K]> => {
  const validator = validators[kind];
  if (!validator(value)) {
    return { ok: false, issues: schemaIssues(validator.errors) };
  }
  const { wireVersion: _wireVersion, ...current } = cloneJson(
    value as Record<string, unknown>
  );
  const normalized = normalizeByKind(
    kind,
    current as BehaviorDocumentByKind[K]
  );
  const semanticIssues =
    kind === 'behavior-scenario'
      ? collectScenarioIdentityIssues(normalized as BehaviorScenario)
      : kind === 'behavior-fixture-set'
        ? collectFixtureIdentityIssues(normalized as BehaviorFixtureSet)
        : [];
  return semanticIssues.length
    ? { ok: false, issues: semanticIssues }
    : { ok: true, value: normalized };
};

/**
 * Applies the explicit wire migration dispatch. V0 has one immutable wire
 * version, so missing, non-numeric, and future versions all fail closed.
 */
export const migrateBehaviorDocumentWire = <K extends BehaviorDocumentKind>(
  kind: K,
  value: unknown
): BehaviorDecodeResult<BehaviorWireDocument<BehaviorDocumentByKind[K]>> => {
  if (!isPlainObject(value) || value.wireVersion !== 1) {
    return {
      ok: false,
      issues: [
        customIssue(
          '/wireVersion',
          'Unsupported Behavior wire version; expected wireVersion 1.'
        ),
      ],
    };
  }
  const decoded = validateEncoded(kind, value);
  return decoded.ok
    ? {
        ok: true,
        value: {
          ...cloneJson(decoded.value),
          wireVersion: 1,
        } as BehaviorWireDocument<BehaviorDocumentByKind[K]>,
      }
    : decoded;
};

export const decodeBehaviorDocument = <K extends BehaviorDocumentKind>(
  kind: K,
  value: unknown
): BehaviorDecodeResult<BehaviorDocumentByKind[K]> => {
  const migrated = migrateBehaviorDocumentWire(kind, value);
  return migrated.ok ? validateEncoded(kind, migrated.value) : migrated;
};

export const validateBehaviorDocument = <K extends BehaviorDocumentKind>(
  kind: K,
  value: unknown
): BehaviorDecodeResult<BehaviorDocumentByKind[K]> => {
  if (
    !isPlainObject(value) ||
    Object.hasOwn(value, 'wireVersion') ||
    Object.hasOwn(value, 'version')
  ) {
    return {
      ok: false,
      issues: [
        customIssue(
          '/',
          'Behavior current models must not expose numeric wire version fields.'
        ),
      ],
    };
  }
  return validateEncoded(kind, { ...cloneJson(value), wireVersion: 1 });
};

export const encodeBehaviorDocument = <K extends BehaviorDocumentKind>(
  kind: K,
  value: BehaviorDocumentByKind[K]
): BehaviorWireDocument<BehaviorDocumentByKind[K]> => {
  const validation = validateBehaviorDocument(kind, value);
  if (!validation.ok) {
    throw new TypeError(
      validation.issues.map((issue) => issue.message).join('; ')
    );
  }
  return {
    ...cloneJson(validation.value),
    wireVersion: 1,
  } as BehaviorWireDocument<BehaviorDocumentByKind[K]>;
};

export const decodeBehaviorScenario = (
  value: unknown
): BehaviorDecodeResult<BehaviorScenario> =>
  decodeBehaviorDocument('behavior-scenario', value);

export const decodeBehaviorControlProfile = (
  value: unknown
): BehaviorDecodeResult<BehaviorControlProfile> =>
  decodeBehaviorDocument('behavior-control-profile', value);

export const decodeBehaviorFixtureSet = (
  value: unknown
): BehaviorDecodeResult<BehaviorFixtureSet> =>
  decodeBehaviorDocument('behavior-fixture-set', value);

export const encodeBehaviorScenario = (
  value: BehaviorScenario
): BehaviorWireDocument<BehaviorScenario> =>
  encodeBehaviorDocument('behavior-scenario', value);

export const encodeBehaviorControlProfile = (
  value: BehaviorControlProfile
): BehaviorWireDocument<BehaviorControlProfile> =>
  encodeBehaviorDocument('behavior-control-profile', value);

export const encodeBehaviorFixtureSet = (
  value: BehaviorFixtureSet
): BehaviorWireDocument<BehaviorFixtureSet> =>
  encodeBehaviorDocument('behavior-fixture-set', value);

export const isBehaviorScenario = (value: unknown): value is BehaviorScenario =>
  validateBehaviorDocument('behavior-scenario', value).ok;

export const isBehaviorControlProfile = (
  value: unknown
): value is BehaviorControlProfile =>
  validateBehaviorDocument('behavior-control-profile', value).ok;

export const isBehaviorFixtureSet = (
  value: unknown
): value is BehaviorFixtureSet =>
  validateBehaviorDocument('behavior-fixture-set', value).ok;
