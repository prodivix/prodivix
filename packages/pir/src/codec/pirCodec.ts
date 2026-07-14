import type { PIRDocument } from '../pir.types';
import {
  CURRENT_PIR_WIRE_VERSION,
  upgradePirWireDocument,
} from './pirMigrationRegistry';

export type PIRDecodeIssueCode =
  | 'PIR_DOMAIN_WIRE_VERSION_FIELD'
  | 'PIR_WIRE_INVALID'
  | 'PIR_WIRE_SCHEMA_VERSION_MISSING'
  | 'PIR_WIRE_SCHEMA_VERSION_UNSUPPORTED'
  | 'PIR_WIRE_MIGRATION_CYCLE'
  | 'PIR_WIRE_MIGRATION_FAILED'
  | 'PIR_WIRE_MIGRATION_VERSION_MISMATCH';

export type PIRDecodeIssue = Readonly<{
  code: PIRDecodeIssueCode;
  path: string;
  message: string;
}>;

export type PIRDecodeResult =
  | Readonly<{ ok: true; value: PIRDocument }>
  | Readonly<{ ok: false; issues: readonly PIRDecodeIssue[] }>;

type UnknownRecord = Record<string, unknown>;
type IssueCollector = PIRDecodeIssue[];
type ValueChecker = (
  value: unknown,
  path: string,
  issues: IssueCollector
) => void;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const addIssue = (
  issues: IssueCollector,
  path: string,
  message: string
): void => {
  issues.push({ code: 'PIR_WIRE_INVALID', path, message });
};

const checkObject = (
  value: unknown,
  path: string,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  issues: IssueCollector
): UnknownRecord | null => {
  if (!isRecord(value)) {
    addIssue(issues, path, 'Expected an object.');
    return null;
  }

  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      addIssue(issues, `${path}.${key}`, 'Unknown property.');
    }
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(value, key)) {
      addIssue(issues, `${path}.${key}`, 'Required property is missing.');
    }
  }
  return value;
};

const checkString = (
  value: unknown,
  path: string,
  issues: IssueCollector
): void => {
  if (typeof value !== 'string') {
    addIssue(issues, path, 'Expected a string.');
  }
};

const checkBoolean = (
  value: unknown,
  path: string,
  issues: IssueCollector
): void => {
  if (typeof value !== 'boolean') {
    addIssue(issues, path, 'Expected a boolean.');
  }
};

const checkNumber = (
  value: unknown,
  path: string,
  issues: IssueCollector
): void => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    addIssue(issues, path, 'Expected a finite number.');
  }
};

const checkLiteral = (
  value: unknown,
  expected: string | number,
  path: string,
  issues: IssueCollector
): void => {
  if (value !== expected) {
    addIssue(issues, path, `Expected ${JSON.stringify(expected)}.`);
  }
};

const checkOptional = (
  object: UnknownRecord,
  key: string,
  path: string,
  issues: IssueCollector,
  checker: ValueChecker
): void => {
  if (Object.hasOwn(object, key)) {
    checker(object[key], `${path}.${key}`, issues);
  }
};

const checkJsonValue: ValueChecker = (value, path, issues) => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return;
  }
  if (typeof value === 'number') {
    checkNumber(value, path, issues);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      checkJsonValue(item, `${path}[${index}]`, issues)
    );
    return;
  }
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      checkJsonValue(item, `${path}.${key}`, issues);
    }
    return;
  }
  addIssue(issues, path, 'Expected a JSON value.');
};

const checkArray = (
  value: unknown,
  path: string,
  issues: IssueCollector,
  checker: ValueChecker
): void => {
  if (!Array.isArray(value)) {
    addIssue(issues, path, 'Expected an array.');
    return;
  }
  value.forEach((item, index) => checker(item, `${path}[${index}]`, issues));
};

const checkStringArray: ValueChecker = (value, path, issues) => {
  checkArray(value, path, issues, checkString);
};

const checkRecordValues = (
  value: unknown,
  path: string,
  issues: IssueCollector,
  checker: ValueChecker
): void => {
  if (!isRecord(value)) {
    addIssue(issues, path, 'Expected a record.');
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    checker(item, `${path}.${key}`, issues);
  }
};

const checkSourceSpan: ValueChecker = (value, path, issues) => {
  const object = checkObject(
    value,
    path,
    ['artifactId', 'startLine', 'startColumn', 'endLine', 'endColumn'],
    ['artifactId', 'startLine', 'startColumn', 'endLine', 'endColumn'],
    issues
  );
  if (!object) return;
  checkString(object.artifactId, `${path}.artifactId`, issues);
  checkNumber(object.startLine, `${path}.startLine`, issues);
  checkNumber(object.startColumn, `${path}.startColumn`, issues);
  checkNumber(object.endLine, `${path}.endLine`, issues);
  checkNumber(object.endColumn, `${path}.endColumn`, issues);
};

const checkCodeReference: ValueChecker = (value, path, issues) => {
  const object = checkObject(
    value,
    path,
    ['artifactId', 'exportName', 'symbolId', 'sourceSpan'],
    ['artifactId'],
    issues
  );
  if (!object) return;
  checkString(object.artifactId, `${path}.artifactId`, issues);
  checkOptional(object, 'exportName', path, issues, checkString);
  checkOptional(object, 'symbolId', path, issues, checkString);
  checkOptional(object, 'sourceSpan', path, issues, checkSourceSpan);
};

const checkTriggerBinding: ValueChecker = (value, path, issues) => {
  if (!isRecord(value)) {
    addIssue(issues, path, 'Expected a trigger binding object.');
    return;
  }

  switch (value.kind) {
    case 'open-url': {
      const object = checkObject(
        value,
        path,
        ['kind', 'href'],
        ['kind', 'href'],
        issues
      );
      if (object) checkString(object.href, `${path}.href`, issues);
      return;
    }
    case 'navigate-route': {
      const object = checkObject(
        value,
        path,
        ['kind', 'routeId'],
        ['kind', 'routeId'],
        issues
      );
      if (object) checkString(object.routeId, `${path}.routeId`, issues);
      return;
    }
    case 'run-nodegraph': {
      const object = checkObject(
        value,
        path,
        ['kind', 'documentId', 'inputMapping'],
        ['kind', 'documentId'],
        issues
      );
      if (!object) return;
      checkString(object.documentId, `${path}.documentId`, issues);
      checkOptional(object, 'inputMapping', path, issues, checkJsonValue);
      return;
    }
    case 'play-animation': {
      const object = checkObject(
        value,
        path,
        ['kind', 'documentId', 'timelineId', 'command'],
        ['kind', 'documentId', 'timelineId', 'command'],
        issues
      );
      if (!object) return;
      checkString(object.documentId, `${path}.documentId`, issues);
      checkString(object.timelineId, `${path}.timelineId`, issues);
      if (
        object.command !== 'play' &&
        object.command !== 'pause' &&
        object.command !== 'seek'
      ) {
        addIssue(issues, `${path}.command`, 'Expected play, pause, or seek.');
      }
      return;
    }
    case 'call-code': {
      const object = checkObject(
        value,
        path,
        ['kind', 'slotId', 'reference'],
        ['kind', 'slotId', 'reference'],
        issues
      );
      if (!object) return;
      checkString(object.slotId, `${path}.slotId`, issues);
      checkCodeReference(object.reference, `${path}.reference`, issues);
      return;
    }
    case 'emit-component-event': {
      const object = checkObject(
        value,
        path,
        ['kind', 'memberId', 'payload'],
        ['kind', 'memberId'],
        issues
      );
      if (!object) return;
      checkString(object.memberId, `${path}.memberId`, issues);
      checkOptional(object, 'payload', path, issues, checkValueBinding);
      return;
    }
    default:
      addIssue(issues, `${path}.kind`, 'Unknown trigger binding kind.');
  }
};

const checkValueBinding: ValueChecker = (value, path, issues) => {
  if (!isRecord(value)) {
    addIssue(issues, path, 'Expected a value binding object.');
    return;
  }

  const checkReferenceBinding = (key: string): void => {
    const object = checkObject(
      value,
      path,
      ['kind', key, 'path'],
      ['kind', key],
      issues
    );
    if (!object) return;
    checkString(object[key], `${path}.${key}`, issues);
    checkOptional(object, 'path', path, issues, checkString);
  };

  switch (value.kind) {
    case 'literal': {
      const object = checkObject(
        value,
        path,
        ['kind', 'value'],
        ['kind', 'value'],
        issues
      );
      if (object) checkJsonValue(object.value, `${path}.value`, issues);
      return;
    }
    case 'param':
      checkReferenceBinding('paramId');
      return;
    case 'state':
      checkReferenceBinding('stateId');
      return;
    case 'data':
      checkReferenceBinding('dataId');
      return;
    case 'collection-symbol':
      checkReferenceBinding('symbolId');
      return;
    case 'component-prop':
      checkReferenceBinding('memberId');
      return;
    case 'component-variant':
      checkReferenceBinding('memberId');
      return;
    case 'slot-prop':
      checkReferenceBinding('memberId');
      return;
    case 'code': {
      const object = checkObject(
        value,
        path,
        ['kind', 'reference'],
        ['kind', 'reference'],
        issues
      );
      if (object) {
        checkCodeReference(object.reference, `${path}.reference`, issues);
      }
      return;
    }
    default:
      addIssue(issues, `${path}.kind`, 'Unknown value binding kind.');
  }
};

const checkCapabilityIds = (
  object: UnknownRecord,
  path: string,
  issues: IssueCollector
): void => {
  checkOptional(object, 'capabilityIds', path, issues, checkStringArray);
};

const checkComponentPropContract: ValueChecker = (value, path, issues) => {
  const object = checkObject(
    value,
    path,
    ['id', 'name', 'typeRef', 'required', 'defaultValue', 'capabilityIds'],
    ['id', 'name', 'typeRef'],
    issues
  );
  if (!object) return;
  checkString(object.id, `${path}.id`, issues);
  checkString(object.name, `${path}.name`, issues);
  checkString(object.typeRef, `${path}.typeRef`, issues);
  checkOptional(object, 'required', path, issues, checkBoolean);
  checkOptional(object, 'defaultValue', path, issues, checkJsonValue);
  checkCapabilityIds(object, path, issues);
};

const checkComponentEventContract: ValueChecker = (value, path, issues) => {
  const object = checkObject(
    value,
    path,
    ['id', 'name', 'payloadTypeRef', 'capabilityIds'],
    ['id', 'name'],
    issues
  );
  if (!object) return;
  checkString(object.id, `${path}.id`, issues);
  checkString(object.name, `${path}.name`, issues);
  checkOptional(object, 'payloadTypeRef', path, issues, checkString);
  checkCapabilityIds(object, path, issues);
};

const checkComponentSlotContract: ValueChecker = (value, path, issues) => {
  const object = checkObject(
    value,
    path,
    ['id', 'name', 'minChildren', 'maxChildren', 'capabilityIds', 'propsById'],
    ['id', 'name'],
    issues
  );
  if (!object) return;
  checkString(object.id, `${path}.id`, issues);
  checkString(object.name, `${path}.name`, issues);
  checkOptional(object, 'minChildren', path, issues, checkNumber);
  checkOptional(object, 'maxChildren', path, issues, checkNumber);
  checkCapabilityIds(object, path, issues);
  if (Object.hasOwn(object, 'propsById')) {
    checkRecordValues(
      object.propsById,
      `${path}.propsById`,
      issues,
      checkComponentPropContract
    );
  }
};

const checkComponentVariantOption: ValueChecker = (value, path, issues) => {
  const object = checkObject(
    value,
    path,
    ['id', 'name'],
    ['id', 'name'],
    issues
  );
  if (!object) return;
  checkString(object.id, `${path}.id`, issues);
  checkString(object.name, `${path}.name`, issues);
};

const checkComponentVariantContract: ValueChecker = (value, path, issues) => {
  const object = checkObject(
    value,
    path,
    ['id', 'name', 'required', 'defaultOptionId', 'optionsById'],
    ['id', 'name', 'optionsById'],
    issues
  );
  if (!object) return;
  checkString(object.id, `${path}.id`, issues);
  checkString(object.name, `${path}.name`, issues);
  checkOptional(object, 'required', path, issues, checkBoolean);
  checkOptional(object, 'defaultOptionId', path, issues, checkString);
  checkRecordValues(
    object.optionsById,
    `${path}.optionsById`,
    issues,
    checkComponentVariantOption
  );
};

const checkComponentPartContract: ValueChecker = (value, path, issues) => {
  const object = checkObject(
    value,
    path,
    ['id', 'name', 'targetNodeId', 'capabilityIds'],
    ['id', 'name', 'targetNodeId'],
    issues
  );
  if (!object) return;
  checkString(object.id, `${path}.id`, issues);
  checkString(object.name, `${path}.name`, issues);
  checkString(object.targetNodeId, `${path}.targetNodeId`, issues);
  checkCapabilityIds(object, path, issues);
};

const checkComponentTokenContract: ValueChecker = (value, path, issues) => {
  const object = checkObject(
    value,
    path,
    ['id', 'tokenPath', 'target', 'required'],
    ['id', 'tokenPath', 'target'],
    issues
  );
  if (!object) return;
  checkString(object.id, `${path}.id`, issues);
  checkString(object.tokenPath, `${path}.tokenPath`, issues);
  checkOptional(object, 'required', path, issues, checkBoolean);

  const target = checkObject(
    object.target,
    `${path}.target`,
    ['kind', 'memberId'],
    ['kind', 'memberId'],
    issues
  );
  if (!target) return;
  if (target.kind !== 'prop' && target.kind !== 'part') {
    addIssue(issues, `${path}.target.kind`, 'Expected prop or part.');
  }
  checkString(target.memberId, `${path}.target.memberId`, issues);
};

const checkComponentAccessibilityContract: ValueChecker = (
  value,
  path,
  issues
) => {
  const object = checkObject(
    value,
    path,
    ['requiredRole', 'requiresAccessibleName', 'description'],
    [],
    issues
  );
  if (!object) return;
  checkOptional(object, 'requiredRole', path, issues, checkString);
  checkOptional(object, 'requiresAccessibleName', path, issues, checkBoolean);
  checkOptional(object, 'description', path, issues, checkString);
};

const checkComponentContract: ValueChecker = (value, path, issues) => {
  const object = checkObject(
    value,
    path,
    [
      'propsById',
      'eventsById',
      'slotsById',
      'variantAxesById',
      'partsById',
      'tokenBindings',
      'accessibility',
    ],
    ['propsById', 'eventsById', 'slotsById', 'variantAxesById'],
    issues
  );
  if (!object) return;
  checkRecordValues(
    object.propsById,
    `${path}.propsById`,
    issues,
    checkComponentPropContract
  );
  checkRecordValues(
    object.eventsById,
    `${path}.eventsById`,
    issues,
    checkComponentEventContract
  );
  checkRecordValues(
    object.slotsById,
    `${path}.slotsById`,
    issues,
    checkComponentSlotContract
  );
  checkRecordValues(
    object.variantAxesById,
    `${path}.variantAxesById`,
    issues,
    checkComponentVariantContract
  );
  if (Object.hasOwn(object, 'partsById')) {
    checkRecordValues(
      object.partsById,
      `${path}.partsById`,
      issues,
      checkComponentPartContract
    );
  }
  if (Object.hasOwn(object, 'tokenBindings')) {
    checkArray(
      object.tokenBindings,
      `${path}.tokenBindings`,
      issues,
      checkComponentTokenContract
    );
  }
  checkOptional(
    object,
    'accessibility',
    path,
    issues,
    checkComponentAccessibilityContract
  );
};

const checkDataScope: ValueChecker = (value, path, issues) => {
  const object = checkObject(
    value,
    path,
    ['source', 'pick', 'value', 'mock', 'extend'],
    [],
    issues
  );
  if (!object) return;
  checkOptional(object, 'source', path, issues, checkValueBinding);
  checkOptional(object, 'pick', path, issues, checkString);
  checkOptional(object, 'value', path, issues, checkValueBinding);
  checkOptional(object, 'mock', path, issues, checkValueBinding);
  if (Object.hasOwn(object, 'extend')) {
    checkRecordValues(
      object.extend,
      `${path}.extend`,
      issues,
      checkValueBinding
    );
  }
};

const checkElementNode: ValueChecker = (value, path, issues) => {
  const object = checkObject(
    value,
    path,
    ['id', 'kind', 'type', 'text', 'style', 'props', 'data', 'events'],
    ['id', 'kind', 'type'],
    issues
  );
  if (!object) return;
  checkString(object.id, `${path}.id`, issues);
  checkLiteral(object.kind, 'element', `${path}.kind`, issues);
  checkString(object.type, `${path}.type`, issues);
  checkOptional(object, 'text', path, issues, checkValueBinding);
  if (Object.hasOwn(object, 'style')) {
    checkRecordValues(object.style, `${path}.style`, issues, checkValueBinding);
  }
  if (Object.hasOwn(object, 'props')) {
    checkRecordValues(object.props, `${path}.props`, issues, checkValueBinding);
  }
  checkOptional(object, 'data', path, issues, checkDataScope);
  if (Object.hasOwn(object, 'events')) {
    checkRecordValues(
      object.events,
      `${path}.events`,
      issues,
      checkTriggerBinding
    );
  }
};

const checkComponentInstanceNode: ValueChecker = (value, path, issues) => {
  const object = checkObject(
    value,
    path,
    ['id', 'kind', 'componentDocumentId', 'bindings'],
    ['id', 'kind', 'componentDocumentId', 'bindings'],
    issues
  );
  if (!object) return;
  checkString(object.id, `${path}.id`, issues);
  checkLiteral(object.kind, 'component-instance', `${path}.kind`, issues);
  checkString(
    object.componentDocumentId,
    `${path}.componentDocumentId`,
    issues
  );
  const bindings = checkObject(
    object.bindings,
    `${path}.bindings`,
    ['props', 'events', 'variants'],
    ['props', 'events', 'variants'],
    issues
  );
  if (!bindings) return;
  checkRecordValues(
    bindings.props,
    `${path}.bindings.props`,
    issues,
    checkValueBinding
  );
  checkRecordValues(
    bindings.events,
    `${path}.bindings.events`,
    issues,
    checkTriggerBinding
  );
  checkRecordValues(
    bindings.variants,
    `${path}.bindings.variants`,
    issues,
    checkString
  );
};

const checkComponentSlotOutletNode: ValueChecker = (value, path, issues) => {
  const object = checkObject(
    value,
    path,
    ['id', 'kind', 'slotMemberId', 'bindings'],
    ['id', 'kind', 'slotMemberId', 'bindings'],
    issues
  );
  if (!object) return;
  checkString(object.id, `${path}.id`, issues);
  checkLiteral(object.kind, 'component-slot-outlet', `${path}.kind`, issues);
  checkString(object.slotMemberId, `${path}.slotMemberId`, issues);
  const bindings = checkObject(
    object.bindings,
    `${path}.bindings`,
    ['props'],
    ['props'],
    issues
  );
  if (!bindings) return;
  checkRecordValues(
    bindings.props,
    `${path}.bindings.props`,
    issues,
    checkValueBinding
  );
};

const checkCollectionSource: ValueChecker = (value, path, issues) => {
  if (!isRecord(value)) {
    addIssue(issues, path, 'Expected a collection source object.');
    return;
  }
  const object = checkObject(
    value,
    path,
    ['kind', 'value'],
    ['kind', 'value'],
    issues
  );
  if (!object) return;
  if (object.kind === 'literal') {
    checkArray(object.value, `${path}.value`, issues, checkJsonValue);
  } else if (object.kind === 'binding') {
    checkValueBinding(object.value, `${path}.value`, issues);
  } else {
    addIssue(issues, `${path}.kind`, 'Expected literal or binding.');
  }
};

const checkCollectionKey: ValueChecker = (value, path, issues) => {
  if (!isRecord(value)) {
    addIssue(issues, path, 'Expected a collection key object.');
    return;
  }
  if (value.kind === 'index') {
    checkObject(value, path, ['kind'], ['kind'], issues);
    return;
  }
  if (value.kind === 'binding') {
    const object = checkObject(
      value,
      path,
      ['kind', 'value'],
      ['kind', 'value'],
      issues
    );
    if (object) checkValueBinding(object.value, `${path}.value`, issues);
    return;
  }
  addIssue(issues, `${path}.kind`, 'Expected binding or index.');
};

const checkCollectionNode: ValueChecker = (value, path, issues) => {
  const object = checkObject(
    value,
    path,
    ['id', 'kind', 'source', 'key', 'symbols'],
    ['id', 'kind', 'source', 'key', 'symbols'],
    issues
  );
  if (!object) return;
  checkString(object.id, `${path}.id`, issues);
  checkLiteral(object.kind, 'collection', `${path}.kind`, issues);
  checkCollectionSource(object.source, `${path}.source`, issues);
  checkCollectionKey(object.key, `${path}.key`, issues);
  const symbols = checkObject(
    object.symbols,
    `${path}.symbols`,
    ['itemId', 'itemName', 'indexId', 'indexName', 'errorId'],
    ['itemId', 'itemName', 'indexId', 'indexName'],
    issues
  );
  if (!symbols) return;
  checkString(symbols.itemId, `${path}.symbols.itemId`, issues);
  checkString(symbols.itemName, `${path}.symbols.itemName`, issues);
  checkString(symbols.indexId, `${path}.symbols.indexId`, issues);
  checkString(symbols.indexName, `${path}.symbols.indexName`, issues);
  checkOptional(symbols, 'errorId', `${path}.symbols`, issues, checkString);
};

const checkNode: ValueChecker = (value, path, issues) => {
  if (!isRecord(value)) {
    addIssue(issues, path, 'Expected a PIR node object.');
    return;
  }
  switch (value.kind) {
    case 'element':
      checkElementNode(value, path, issues);
      return;
    case 'component-instance':
      checkComponentInstanceNode(value, path, issues);
      return;
    case 'component-slot-outlet':
      checkComponentSlotOutletNode(value, path, issues);
      return;
    case 'collection':
      checkCollectionNode(value, path, issues);
      return;
    default:
      addIssue(
        issues,
        `${path}.kind`,
        'Expected element, component-instance, component-slot-outlet, or collection.'
      );
  }
};

const checkRegionMap: ValueChecker = (value, path, issues) => {
  checkRecordValues(value, path, issues, checkStringArray);
};

const checkUiGraph: ValueChecker = (value, path, issues) => {
  const object = checkObject(
    value,
    path,
    ['version', 'rootId', 'nodesById', 'childIdsById', 'regionsById', 'order'],
    ['version', 'rootId', 'nodesById', 'childIdsById'],
    issues
  );
  if (!object) return;
  checkLiteral(object.version, 1, `${path}.version`, issues);
  checkString(object.rootId, `${path}.rootId`, issues);
  checkRecordValues(object.nodesById, `${path}.nodesById`, issues, checkNode);
  checkRecordValues(
    object.childIdsById,
    `${path}.childIdsById`,
    issues,
    checkStringArray
  );
  if (Object.hasOwn(object, 'regionsById')) {
    checkRecordValues(
      object.regionsById,
      `${path}.regionsById`,
      issues,
      checkRegionMap
    );
  }
  if (Object.hasOwn(object, 'order')) {
    const order = checkObject(
      object.order,
      `${path}.order`,
      ['strategy'],
      ['strategy'],
      issues
    );
    if (order) {
      checkLiteral(
        order.strategy,
        'childIdsById',
        `${path}.order.strategy`,
        issues
      );
    }
  }
};

const checkLogicDefinition: ValueChecker = (value, path, issues) => {
  const object = checkObject(value, path, ['props', 'state'], [], issues);
  if (!object) return;
  if (Object.hasOwn(object, 'props')) {
    checkRecordValues(
      object.props,
      `${path}.props`,
      issues,
      (entry, entryPath) => {
        const definition = checkObject(
          entry,
          entryPath,
          ['name', 'typeRef', 'description', 'defaultValue'],
          ['typeRef'],
          issues
        );
        if (!definition) return;
        checkOptional(definition, 'name', entryPath, issues, checkString);
        checkString(definition.typeRef, `${entryPath}.typeRef`, issues);
        checkOptional(
          definition,
          'description',
          entryPath,
          issues,
          checkString
        );
        checkOptional(
          definition,
          'defaultValue',
          entryPath,
          issues,
          checkJsonValue
        );
      }
    );
  }
  if (Object.hasOwn(object, 'state')) {
    checkRecordValues(
      object.state,
      `${path}.state`,
      issues,
      (entry, entryPath) => {
        const definition = checkObject(
          entry,
          entryPath,
          ['name', 'typeRef', 'initial'],
          ['initial'],
          issues
        );
        if (!definition) return;
        checkOptional(definition, 'name', entryPath, issues, checkString);
        checkOptional(definition, 'typeRef', entryPath, issues, checkString);
        checkJsonValue(definition.initial, `${entryPath}.initial`, issues);
      }
    );
  }
};

const checkMetadata: ValueChecker = (value, path, issues) => {
  const object = checkObject(
    value,
    path,
    ['name', 'description', 'author', 'createdAt', 'updatedAt'],
    [],
    issues
  );
  if (!object) return;
  for (const key of [
    'name',
    'description',
    'author',
    'createdAt',
    'updatedAt',
  ]) {
    checkOptional(object, key, path, issues, checkString);
  }
};

const checkDocument = (value: unknown, issues: IssueCollector): void => {
  const object = checkObject(
    value,
    '$',
    ['version', 'metadata', 'componentContract', 'ui', 'logic'],
    ['version', 'ui'],
    issues
  );
  if (!object) return;
  checkLiteral(object.version, CURRENT_PIR_WIRE_VERSION, '$.version', issues);
  checkOptional(object, 'metadata', '$', issues, checkMetadata);
  checkOptional(
    object,
    'componentContract',
    '$',
    issues,
    checkComponentContract
  );
  const ui = checkObject(object.ui, '$.ui', ['graph'], ['graph'], issues);
  if (ui) checkUiGraph(ui.graph, '$.ui.graph', issues);
  checkOptional(object, 'logic', '$', issues, checkLogicDefinition);
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])])
  );
};

const toDomainDocument = (wireDocument: unknown): PIRDocument => {
  const canonical = canonicalize(wireDocument) as UnknownRecord;
  const {
    version: _documentVersion,
    componentContract: rawContract,
    ui: rawUi,
    ...documentFields
  } = canonical;
  const ui = rawUi as UnknownRecord;
  const graph = ui.graph as UnknownRecord;
  const { version: _graphVersion, ...graphFields } = graph;

  return canonicalize({
    ...documentFields,
    ...(rawContract ? { componentContract: rawContract } : {}),
    ui: { ...ui, graph: graphFields },
  }) as PIRDocument;
};

const toWireDocument = (document: PIRDocument): UnknownRecord => {
  const canonical = canonicalize(document) as UnknownRecord;
  const {
    componentContract: rawContract,
    ui: rawUi,
    ...documentFields
  } = canonical;
  const ui = rawUi as UnknownRecord;
  const graph = ui.graph as UnknownRecord;

  return {
    ...documentFields,
    version: CURRENT_PIR_WIRE_VERSION,
    ...(rawContract ? { componentContract: rawContract } : {}),
    ui: { ...ui, graph: { ...graph, version: 1 } },
  };
};

const collectDomainWireVersionIssues = (
  document: PIRDocument
): readonly PIRDecodeIssue[] => {
  const raw = document as unknown;
  if (!isRecord(raw)) return [];
  const issues: PIRDecodeIssue[] = [];
  const addVersionIssue = (path: string) =>
    issues.push({
      code: 'PIR_DOMAIN_WIRE_VERSION_FIELD',
      path,
      message:
        'Wire schema version fields are not part of the PIR domain model.',
    });
  if (Object.hasOwn(raw, 'version')) addVersionIssue('$.version');
  if (
    isRecord(raw.ui) &&
    isRecord(raw.ui.graph) &&
    Object.hasOwn(raw.ui.graph, 'version')
  ) {
    addVersionIssue('$.ui.graph.version');
  }
  return issues;
};

/** Decodes any registered wire schema into the version-neutral domain model. */
export const decodePirDocument = (value: unknown): PIRDecodeResult => {
  const upgraded = upgradePirWireDocument(value);
  if (!upgraded.ok) {
    return {
      ok: false,
      issues: upgraded.issues.map(({ code, path, message }) => ({
        code,
        path,
        message,
      })),
    };
  }
  const issues: IssueCollector = [];
  checkDocument(upgraded.value, issues);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: toDomainDocument(upgraded.value) };
};

export const tryNormalizePirDocument = (
  document: PIRDocument
): PIRDecodeResult => {
  const versionIssues = collectDomainWireVersionIssues(document);
  return versionIssues.length > 0
    ? { ok: false, issues: versionIssues }
    : decodePirDocument(toWireDocument(document));
};

export const normalizePirDocument = (document: PIRDocument): PIRDocument => {
  const decoded = tryNormalizePirDocument(document);
  if (!decoded.ok) {
    const detail = decoded.issues
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join('; ');
    throw new TypeError(`Invalid PIR document: ${detail}`);
  }
  return decoded.value;
};

export const encodePirDocument = (document: PIRDocument): string =>
  JSON.stringify(canonicalize(toWireDocument(normalizePirDocument(document))));

/** Projects a domain JSON Patch value into the active wire shape. */
export const projectPirPatchValueToWire = (
  path: string,
  value: unknown
): unknown => {
  if (path === '' || path === '/') {
    return JSON.parse(encodePirDocument(value as PIRDocument));
  }
  const canonical = canonicalize(value);
  if (path === '/ui/graph' && isRecord(canonical)) {
    return canonicalize({ ...canonical, version: 1 });
  }
  if (path === '/ui' && isRecord(canonical) && isRecord(canonical.graph)) {
    return canonicalize({
      ...canonical,
      graph: { ...canonical.graph, version: 1 },
    });
  }
  return canonical;
};
