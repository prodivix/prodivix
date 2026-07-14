type WireRecord = Record<string, unknown>;

const hasOwn = (value: WireRecord, key: string): boolean =>
  Object.hasOwn(value, key);

const requireRecord = (value: unknown, path: string): WireRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object.`);
  }
  return value as WireRecord;
};

const requireString = (value: unknown, path: string): string => {
  if (typeof value !== 'string') {
    throw new TypeError(`${path} must be a string.`);
  }
  return value;
};

const assertAllowedKeys = (
  value: WireRecord,
  allowedKeys: readonly string[],
  path: string
): void => {
  const allowed = new Set(allowedKeys);
  const unknownKey = Object.keys(value).find((key) => !allowed.has(key));
  if (unknownKey) {
    throw new TypeError(
      `${path}.${unknownKey} cannot be migrated without losing authoring semantics.`
    );
  }
};

const canonicalJson = (value: unknown, path: string): unknown => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalJson(item, `${path}[${index}]`));
  }
  const record = requireRecord(value, path);
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonicalJson(record[key], `${path}.${key}`)])
  );
};

const migrateValueBinding = (value: unknown, path: string): unknown => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as WireRecord;
    const keys = Object.keys(record);
    if (keys.length === 1) {
      const referenceKey = keys[0];
      const referenceValue = referenceKey ? record[referenceKey] : undefined;
      if (referenceKey === '$param') {
        return {
          kind: 'param',
          paramId: requireString(referenceValue, `${path}.$param`),
        };
      }
      if (referenceKey === '$state') {
        return {
          kind: 'state',
          stateId: requireString(referenceValue, `${path}.$state`),
        };
      }
      if (referenceKey === '$data') {
        requireString(referenceValue, `${path}.$data`);
        throw new TypeError(
          `${path} uses a legacy data path that requires explicit dataId and path mapping.`
        );
      }
      if (referenceKey === '$item' || referenceKey === '$index') {
        throw new TypeError(
          `${path} uses a legacy list symbol that requires an explicit Collection migration.`
        );
      }
    }
  }
  return { kind: 'literal', value: canonicalJson(value, path) };
};

const migrateBindingRecord = (value: unknown, path: string): WireRecord => {
  const record = requireRecord(value, path);
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, migrateValueBinding(record[key], `${path}.${key}`)])
  );
};

const migrateDataScope = (value: unknown, path: string): WireRecord => {
  const record = requireRecord(value, path);
  assertAllowedKeys(
    record,
    ['source', 'pick', 'value', 'mock', 'extend'],
    path
  );
  return {
    ...(hasOwn(record, 'source')
      ? { source: migrateValueBinding(record.source, `${path}.source`) }
      : {}),
    ...(hasOwn(record, 'pick')
      ? { pick: requireString(record.pick, `${path}.pick`) }
      : {}),
    ...(hasOwn(record, 'value')
      ? { value: migrateValueBinding(record.value, `${path}.value`) }
      : {}),
    ...(hasOwn(record, 'mock')
      ? { mock: migrateValueBinding(record.mock, `${path}.mock`) }
      : {}),
    ...(hasOwn(record, 'extend')
      ? { extend: migrateBindingRecord(record.extend, `${path}.extend`) }
      : {}),
  };
};

const migrateNode = (value: unknown, path: string): WireRecord => {
  const node = requireRecord(value, path);
  assertAllowedKeys(
    node,
    ['id', 'type', 'text', 'style', 'props', 'data', 'list', 'events'],
    path
  );
  if (hasOwn(node, 'list')) {
    throw new TypeError(
      `${path}.list must be migrated to a first-class Collection explicitly.`
    );
  }
  if (hasOwn(node, 'events')) {
    const events = requireRecord(node.events, `${path}.events`);
    if (Object.keys(events).length > 0) {
      throw new TypeError(
        `${path}.events uses legacy action strings and requires explicit CodeReference mapping.`
      );
    }
  }
  return {
    id: requireString(node.id, `${path}.id`),
    kind: 'element',
    type: requireString(node.type, `${path}.type`),
    ...(hasOwn(node, 'text')
      ? { text: migrateValueBinding(node.text, `${path}.text`) }
      : {}),
    ...(hasOwn(node, 'style')
      ? { style: migrateBindingRecord(node.style, `${path}.style`) }
      : {}),
    ...(hasOwn(node, 'props')
      ? { props: migrateBindingRecord(node.props, `${path}.props`) }
      : {}),
    ...(hasOwn(node, 'data')
      ? { data: migrateDataScope(node.data, `${path}.data`) }
      : {}),
    ...(hasOwn(node, 'events') ? { events: {} } : {}),
  };
};

const migrateGraph = (value: unknown, path: string): WireRecord => {
  const graph = requireRecord(value, path);
  assertAllowedKeys(
    graph,
    ['version', 'rootId', 'nodesById', 'childIdsById', 'regionsById', 'order'],
    path
  );
  if (graph.version !== 1) {
    throw new TypeError(`${path}.version must be 1.`);
  }
  const nodes = requireRecord(graph.nodesById, `${path}.nodesById`);
  return {
    version: 1,
    rootId: requireString(graph.rootId, `${path}.rootId`),
    nodesById: Object.fromEntries(
      Object.keys(nodes)
        .sort()
        .map((nodeId) => [
          nodeId,
          migrateNode(nodes[nodeId], `${path}.nodesById.${nodeId}`),
        ])
    ),
    childIdsById: canonicalJson(graph.childIdsById, `${path}.childIdsById`),
    ...(hasOwn(graph, 'regionsById')
      ? {
          regionsById: canonicalJson(graph.regionsById, `${path}.regionsById`),
        }
      : {}),
    ...(hasOwn(graph, 'order')
      ? { order: canonicalJson(graph.order, `${path}.order`) }
      : {}),
  };
};

const migrateMetadata = (value: unknown, path: string): WireRecord => {
  const metadata = requireRecord(value, path);
  const fields = ['name', 'description', 'author', 'createdAt', 'updatedAt'];
  assertAllowedKeys(metadata, fields, path);
  return Object.fromEntries(
    fields
      .filter((field) => hasOwn(metadata, field))
      .map((field) => [
        field,
        requireString(metadata[field], `${path}.${field}`),
      ])
  );
};

const migrateLogic = (value: unknown, path: string): WireRecord => {
  const logic = requireRecord(value, path);
  assertAllowedKeys(logic, ['props', 'state', 'graphs'], path);
  if (hasOwn(logic, 'graphs')) {
    throw new TypeError(
      `${path}.graphs must be migrated to standalone NodeGraph documents.`
    );
  }
  const migrateDefinitions = (
    rawDefinitions: unknown,
    definitionPath: string,
    kind: 'prop' | 'state'
  ) => {
    const definitions = requireRecord(rawDefinitions, definitionPath);
    return Object.fromEntries(
      Object.keys(definitions)
        .sort()
        .map((definitionId) => {
          const entryPath = `${definitionPath}.${definitionId}`;
          const definition = requireRecord(
            definitions[definitionId],
            entryPath
          );
          if (kind === 'prop') {
            assertAllowedKeys(
              definition,
              ['type', 'description', 'default'],
              entryPath
            );
            return [
              definitionId,
              {
                typeRef: requireString(definition.type, `${entryPath}.type`),
                ...(hasOwn(definition, 'description')
                  ? {
                      description: requireString(
                        definition.description,
                        `${entryPath}.description`
                      ),
                    }
                  : {}),
                ...(hasOwn(definition, 'default')
                  ? {
                      defaultValue: canonicalJson(
                        definition.default,
                        `${entryPath}.default`
                      ),
                    }
                  : {}),
              },
            ];
          }
          assertAllowedKeys(definition, ['type', 'initial'], entryPath);
          return [
            definitionId,
            {
              ...(hasOwn(definition, 'type')
                ? {
                    typeRef: requireString(
                      definition.type,
                      `${entryPath}.type`
                    ),
                  }
                : {}),
              initial: canonicalJson(
                definition.initial,
                `${entryPath}.initial`
              ),
            },
          ];
        })
    );
  };
  return {
    ...(hasOwn(logic, 'props')
      ? {
          props: migrateDefinitions(logic.props, `${path}.props`, 'prop'),
        }
      : {}),
    ...(hasOwn(logic, 'state')
      ? {
          state: migrateDefinitions(logic.state, `${path}.state`, 'state'),
        }
      : {}),
  };
};

/** Migrates the safely representable v1.3 subset; unsupported semantics fail closed. */
export const migratePirWireV13ToV14 = (value: unknown): unknown => {
  const document = requireRecord(value, '$');
  assertAllowedKeys(
    document,
    ['version', 'metadata', 'ui', 'logic', 'animation'],
    '$'
  );
  if (document.version !== '1.3') {
    throw new TypeError('$.version must be "1.3".');
  }
  if (hasOwn(document, 'animation')) {
    throw new TypeError(
      '$.animation must be migrated to a standalone Animation document.'
    );
  }
  const ui = requireRecord(document.ui, '$.ui');
  assertAllowedKeys(ui, ['graph'], '$.ui');
  return {
    version: '1.4',
    ...(hasOwn(document, 'metadata')
      ? { metadata: migrateMetadata(document.metadata, '$.metadata') }
      : {}),
    ui: { graph: migrateGraph(ui.graph, '$.ui.graph') },
    ...(hasOwn(document, 'logic')
      ? { logic: migrateLogic(document.logic, '$.logic') }
      : {}),
  };
};

export const PIR_WIRE_MIGRATION_V13_TO_V14 = Object.freeze({
  fromVersion: '1.3',
  toVersion: '1.4',
  migrate: migratePirWireV13ToV14,
});
