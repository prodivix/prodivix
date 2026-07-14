import { tryNormalizePirDocument } from '../codec/pirCodec';
import type {
  PIRComponentInstanceNode,
  PIRDocument,
  PIRValueBinding,
} from '../pir.types';
import { validatePirDocument } from '../pirValidator';
import {
  PIR_COMPONENT_MUTATION_ISSUE_CODES,
  createPirMutationIssue,
  freezePirMutationIssues,
  type PIRComponentMutationIssue,
  type PIRGraphPlacementTarget,
} from './pirMutationGraph';

export type PIRMutationDocumentValidation =
  | Readonly<{ ok: true; document: PIRDocument }>
  | Readonly<{
      ok: false;
      issues: readonly PIRComponentMutationIssue[];
    }>;

export type PIRComponentInstanceValidation =
  | Readonly<{ ok: true; instance: PIRComponentInstanceNode }>
  | Readonly<{
      ok: false;
      issues: readonly PIRComponentMutationIssue[];
    }>;

type UnknownRecord = Record<string, unknown>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const escapePointerToken = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const addInvalidId = (
  issues: PIRComponentMutationIssue[],
  value: unknown,
  path: string,
  label: string
): void => {
  if (typeof value === 'string' && value.trim().length > 0) return;
  issues.push(
    createPirMutationIssue(
      PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidId,
      path,
      `${label} must be a non-empty string.`
    )
  );
};

const addUnsupportedFields = (
  issues: PIRComponentMutationIssue[],
  value: UnknownRecord,
  allowedFields: readonly string[],
  path: string
): void => {
  const allowed = new Set(allowedFields);
  for (const field of Object.keys(value).sort(compareText)) {
    if (allowed.has(field)) continue;
    issues.push(
      createPirMutationIssue(
        PIR_COMPONENT_MUTATION_ISSUE_CODES.unsupportedField,
        `${path}/${escapePointerToken(field)}`,
        'Mutation input contains a non-canonical field.'
      )
    );
  }
};

const validateCodeReferenceIds = (
  value: unknown,
  path: string,
  issues: PIRComponentMutationIssue[]
): void => {
  if (!isRecord(value)) return;
  addInvalidId(
    issues,
    value.artifactId,
    `${path}/artifactId`,
    'Code artifactId'
  );
  if (Object.hasOwn(value, 'symbolId')) {
    addInvalidId(issues, value.symbolId, `${path}/symbolId`, 'Code symbolId');
  }
};

const validateValueBindingIds = (
  value: unknown,
  path: string,
  issues: PIRComponentMutationIssue[]
): void => {
  if (!isRecord(value)) return;
  switch (value.kind) {
    case 'param':
      addInvalidId(issues, value.paramId, `${path}/paramId`, 'Param id');
      return;
    case 'state':
      addInvalidId(issues, value.stateId, `${path}/stateId`, 'State id');
      return;
    case 'data':
      addInvalidId(issues, value.dataId, `${path}/dataId`, 'Data id');
      return;
    case 'collection-symbol':
      addInvalidId(
        issues,
        value.symbolId,
        `${path}/symbolId`,
        'Collection symbol id'
      );
      return;
    case 'component-prop':
      addInvalidId(
        issues,
        value.memberId,
        `${path}/memberId`,
        'Component prop member id'
      );
      return;
    case 'code':
      validateCodeReferenceIds(value.reference, `${path}/reference`, issues);
  }
};

const validateTriggerTargetIds = (
  value: unknown,
  path: string,
  issues: PIRComponentMutationIssue[]
): void => {
  if (!isRecord(value)) return;
  switch (value.kind) {
    case 'navigate-route':
      addInvalidId(issues, value.routeId, `${path}/routeId`, 'Route id');
      return;
    case 'run-nodegraph':
      addInvalidId(
        issues,
        value.documentId,
        `${path}/documentId`,
        'NodeGraph document id'
      );
      return;
    case 'play-animation':
      addInvalidId(
        issues,
        value.documentId,
        `${path}/documentId`,
        'Animation document id'
      );
      addInvalidId(
        issues,
        value.timelineId,
        `${path}/timelineId`,
        'Animation timeline id'
      );
      return;
    case 'call-code':
      addInvalidId(issues, value.slotId, `${path}/slotId`, 'Code slot id');
      validateCodeReferenceIds(value.reference, `${path}/reference`, issues);
  }
};

const validateBindings = (
  bindings: UnknownRecord,
  issues: PIRComponentMutationIssue[]
): void => {
  addUnsupportedFields(
    issues,
    bindings,
    ['props', 'events', 'variants'],
    '/instance/bindings'
  );
  for (const [memberId, value] of Object.entries(
    isRecord(bindings.props) ? bindings.props : {}
  ).sort(([left], [right]) => compareText(left, right))) {
    addInvalidId(
      issues,
      memberId,
      `/instance/bindings/props/${escapePointerToken(memberId)}`,
      'Component prop member id'
    );
    validateValueBindingIds(
      value,
      `/instance/bindings/props/${escapePointerToken(memberId)}`,
      issues
    );
  }
  for (const [memberId, value] of Object.entries(
    isRecord(bindings.events) ? bindings.events : {}
  ).sort(([left], [right]) => compareText(left, right))) {
    addInvalidId(
      issues,
      memberId,
      `/instance/bindings/events/${escapePointerToken(memberId)}`,
      'Component event member id'
    );
    validateTriggerTargetIds(
      value,
      `/instance/bindings/events/${escapePointerToken(memberId)}`,
      issues
    );
  }
  for (const [memberId, optionId] of Object.entries(
    isRecord(bindings.variants) ? bindings.variants : {}
  ).sort(([left], [right]) => compareText(left, right))) {
    const path = `/instance/bindings/variants/${escapePointerToken(memberId)}`;
    addInvalidId(issues, memberId, path, 'Component variant member id');
    addInvalidId(issues, optionId, path, 'Component variant option id');
  }
};

const addInvalidShape = (
  issues: PIRComponentMutationIssue[],
  path: string,
  message: string
): void => {
  issues.push(
    createPirMutationIssue(
      PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidInstance,
      path,
      message
    )
  );
};

export const validatePirComponentInstanceInput = (
  value: PIRComponentInstanceNode
): PIRComponentInstanceValidation => {
  const raw = value as unknown;
  const issues: PIRComponentMutationIssue[] = [];
  if (!isRecord(raw)) {
    addInvalidShape(
      issues,
      '/instance',
      'Component Instance must be an object.'
    );
    return { ok: false, issues: freezePirMutationIssues(issues) };
  }
  addUnsupportedFields(
    issues,
    raw,
    ['id', 'kind', 'componentDocumentId', 'bindings'],
    '/instance'
  );
  addInvalidId(issues, raw.id, '/instance/id', 'Component Instance node id');
  addInvalidId(
    issues,
    raw.componentDocumentId,
    '/instance/componentDocumentId',
    'Component document id'
  );
  if (raw.kind !== 'component-instance') {
    addInvalidShape(
      issues,
      '/instance/kind',
      'Node kind must be component-instance.'
    );
  }
  if (!isRecord(raw.bindings)) {
    addInvalidShape(
      issues,
      '/instance/bindings',
      'Component Instance bindings must be an object.'
    );
  } else {
    for (const field of ['props', 'events', 'variants'] as const) {
      if (!isRecord(raw.bindings[field])) {
        addInvalidShape(
          issues,
          `/instance/bindings/${field}`,
          `Component Instance ${field} bindings must be an object.`
        );
      }
    }
    validateBindings(raw.bindings, issues);
  }
  if (issues.length > 0) {
    return { ok: false, issues: freezePirMutationIssues(issues) };
  }

  const bindings = raw.bindings as UnknownRecord;
  return {
    ok: true,
    instance: {
      id: raw.id as string,
      kind: 'component-instance',
      componentDocumentId: raw.componentDocumentId as string,
      bindings: {
        props: Object.fromEntries(
          Object.entries(bindings.props as UnknownRecord).sort(
            ([left], [right]) => compareText(left, right)
          )
        ) as Readonly<Record<string, PIRValueBinding>>,
        events: Object.fromEntries(
          Object.entries(bindings.events as UnknownRecord).sort(
            ([left], [right]) => compareText(left, right)
          )
        ) as PIRComponentInstanceNode['bindings']['events'],
        variants: Object.fromEntries(
          Object.entries(bindings.variants as UnknownRecord).sort(
            ([left], [right]) => compareText(left, right)
          )
        ) as Readonly<Record<string, string>>,
      },
    },
  };
};

export const validatePirPlacementTargetInput = (
  target: PIRGraphPlacementTarget
): readonly PIRComponentMutationIssue[] => {
  if (!isRecord(target)) {
    return Object.freeze([
      createPirMutationIssue(
        PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidPlacementOwner,
        '/target',
        'Placement target must be an object.'
      ),
    ]);
  }
  const issues: PIRComponentMutationIssue[] = [];
  addUnsupportedFields(
    issues,
    target,
    ['parentId', 'index', 'regionName'],
    '/target'
  );
  return freezePirMutationIssues(issues);
};

export const validatePirMutationDocument = (
  document: PIRDocument,
  phase: 'source' | 'result'
): PIRMutationDocumentValidation => {
  const decoded = tryNormalizePirDocument(document);
  if (!decoded.ok) {
    const code =
      phase === 'source'
        ? PIR_COMPONENT_MUTATION_ISSUE_CODES.sourceFormatInvalid
        : PIR_COMPONENT_MUTATION_ISSUE_CODES.resultFormatInvalid;
    return {
      ok: false,
      issues: freezePirMutationIssues(
        decoded.issues.map(({ path, message }) =>
          createPirMutationIssue(code, path, message)
        )
      ),
    };
  }
  const validation = validatePirDocument(decoded.value);
  if (!validation.valid) {
    const code =
      phase === 'source'
        ? PIR_COMPONENT_MUTATION_ISSUE_CODES.sourceSemanticInvalid
        : PIR_COMPONENT_MUTATION_ISSUE_CODES.resultSemanticInvalid;
    return {
      ok: false,
      issues: freezePirMutationIssues(
        validation.issues.map(({ path, code: causeCode, message }) =>
          createPirMutationIssue(code, path, `${causeCode}: ${message}`)
        )
      ),
    };
  }
  return { ok: true, document: decoded.value };
};
