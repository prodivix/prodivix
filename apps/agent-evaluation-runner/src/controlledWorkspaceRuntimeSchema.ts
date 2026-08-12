import type { AgentJsonValue } from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';

export const CONTROLLED_WORKSPACE_SCHEMA_LIMITS = Object.freeze({
  maximumSchemaBytes: 65_536,
  maximumSchemaDepth: 16,
  maximumSchemaNodes: 256,
  maximumSchemaProperties: 256,
  maximumSchemaPropertiesPerObject: 128,
  maximumSchemaEnumItems: 256,
  maximumSchemaEnumItemsPerNode: 64,
  maximumPatternLength: 128,
  maximumStringCodePoints: 65_536,
  maximumArgumentBytes: 262_144,
  maximumArgumentDepth: 24,
  maximumArgumentNodes: 4_096,
  maximumArgumentProperties: 2_048,
  maximumArgumentArrayItems: 2_048,
  maximumArgumentArrayItemsPerArray: 1_024,
} as const);

export type ControlledWorkspaceSchemaValidation = Readonly<
  | { ok: true }
  | {
      ok: false;
      code: 'schema-invalid' | 'arguments-invalid';
    }
>;

export type ControlledWorkspaceCompiledToolSchema = Readonly<{
  format: 'prodivix.agent-evaluation-controlled-workspace-compiled-schema';
  version: 1;
}>;

export type ControlledWorkspaceToolSchemaCompilation = Readonly<
  | {
      ok: true;
      compiledSchema: ControlledWorkspaceCompiledToolSchema;
    }
  | {
      ok: false;
      code: 'schema-invalid';
    }
>;

type JsonInspectionLimits = Readonly<{
  maximumBytes: number;
  maximumDepth: number;
  maximumNodes: number;
  maximumProperties: number;
  maximumArrayItems: number;
  maximumArrayItemsPerArray: number;
}>;

type JsonInspectionBudget = {
  nodes: number;
  properties: number;
  arrayItems: number;
};

type CompilationBudget = {
  nodes: number;
  properties: number;
  enumItems: number;
};

type CompiledCommon = Readonly<{
  constCanonicalText?: string;
  enumCanonicalTexts?: ReadonlySet<string>;
}>;

type CompiledPattern = Readonly<
  | {
      kind: 'literal';
      literal: string;
      minimumCodePoints: number;
      maximumCodePoints: number;
    }
  | {
      kind: 'ascii-character-class';
      expression: RegExp;
      minimumCodePoints: number;
      maximumCodePoints: number;
    }
  | {
      kind: 'literal-prefix-ascii-character-class';
      prefix: string;
      suffixExpression: RegExp;
      minimumCodePoints: number;
      maximumCodePoints: number;
    }
>;

type CompiledNode =
  | Readonly<{
      kind: 'string';
      common: CompiledCommon;
      minimumLength: number;
      maximumLength: number;
      pattern?: CompiledPattern;
    }>
  | Readonly<{
      kind: 'number';
      common: CompiledCommon;
      minimum?: number;
      maximum?: number;
    }>
  | Readonly<{
      kind: 'boolean';
      common: CompiledCommon;
    }>
  | Readonly<{
      kind: 'null';
      common: CompiledCommon;
    }>
  | Readonly<{
      kind: 'array';
      common: CompiledCommon;
      items: CompiledNode;
      minimumItems: number;
      maximumItems: number;
      uniqueItems: boolean;
    }>
  | Readonly<{
      kind: 'object';
      common: CompiledCommon;
      properties: ReadonlyMap<string, CompiledNode>;
      required: ReadonlySet<string>;
      minimumProperties: number;
      maximumProperties: number;
    }>;

const validResult = Object.freeze({ ok: true as const });
const invalidSchemaResult = Object.freeze({
  ok: false as const,
  code: 'schema-invalid' as const,
});
const invalidArgumentsResult = Object.freeze({
  ok: false as const,
  code: 'arguments-invalid' as const,
});
const textEncoder = new TextEncoder();
const compiledRoots = new WeakMap<
  ControlledWorkspaceCompiledToolSchema,
  CompiledNode
>();

const schemaInspectionLimits: JsonInspectionLimits = Object.freeze({
  maximumBytes: CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumSchemaBytes,
  maximumDepth: CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumSchemaDepth * 3 + 4,
  maximumNodes: CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumSchemaNodes * 8,
  maximumProperties:
    CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumSchemaProperties * 8,
  maximumArrayItems:
    CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumSchemaEnumItems * 8,
  maximumArrayItemsPerArray:
    CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumSchemaEnumItems,
});

const argumentInspectionLimits: JsonInspectionLimits = Object.freeze({
  maximumBytes: CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumArgumentBytes,
  maximumDepth: CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumArgumentDepth,
  maximumNodes: CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumArgumentNodes,
  maximumProperties:
    CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumArgumentProperties,
  maximumArrayItems:
    CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumArgumentArrayItems,
  maximumArrayItemsPerArray:
    CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumArgumentArrayItemsPerArray,
});

const exactDataRecord = (value: unknown): value is Record<string, unknown> => {
  if (!isPlainObject(value) || Object.getOwnPropertySymbols(value).length > 0) {
    return false;
  }
  const ownNames = Object.getOwnPropertyNames(value);
  const keys = Object.keys(value);
  if (
    ownNames.length !== keys.length ||
    ownNames.some((key, index) => key !== keys[index]) ||
    keys.some(isUnsafeObjectKey)
  ) {
    return false;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return keys.every((key) => {
    const descriptor = descriptors[key];
    return descriptor?.enumerable === true && 'value' in descriptor;
  });
};

const exactDataArray = (value: unknown): value is readonly unknown[] => {
  if (!Array.isArray(value) || Object.getOwnPropertySymbols(value).length > 0) {
    return false;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.getOwnPropertyNames(value).filter(
    (key) => key !== 'length'
  );
  return (
    keys.length === value.length &&
    keys.every((key, index) => {
      const descriptor = descriptors[key];
      return (
        key === String(index) &&
        descriptor?.enumerable === true &&
        'value' in descriptor
      );
    })
  );
};

const inspectBoundedJson = (
  value: unknown,
  limits: JsonInspectionLimits
): string | undefined => {
  const budget: JsonInspectionBudget = {
    nodes: 0,
    properties: 0,
    arrayItems: 0,
  };
  const ancestors = new Set<object>();
  const visit = (candidate: unknown, depth: number): boolean => {
    budget.nodes += 1;
    if (budget.nodes > limits.maximumNodes || depth > limits.maximumDepth) {
      return false;
    }
    if (
      candidate === null ||
      typeof candidate === 'string' ||
      typeof candidate === 'boolean'
    ) {
      return true;
    }
    if (typeof candidate === 'number') return Number.isSafeInteger(candidate);
    if (typeof candidate !== 'object' || ancestors.has(candidate)) return false;
    ancestors.add(candidate);
    try {
      if (Array.isArray(candidate)) {
        if (!exactDataArray(candidate)) return false;
        budget.arrayItems += candidate.length;
        if (
          candidate.length > limits.maximumArrayItemsPerArray ||
          budget.arrayItems > limits.maximumArrayItems
        ) {
          return false;
        }
        return candidate.every((entry) => visit(entry, depth + 1));
      }
      if (!exactDataRecord(candidate)) return false;
      const values = Object.values(candidate);
      budget.properties += values.length;
      if (budget.properties > limits.maximumProperties) return false;
      return values.every((entry) => visit(entry, depth + 1));
    } finally {
      ancestors.delete(candidate);
    }
  };
  if (!visit(value, 0)) return undefined;
  try {
    const text = canonicalJsonText(value);
    return textEncoder.encode(text).byteLength <= limits.maximumBytes
      ? text
      : undefined;
  } catch {
    return undefined;
  }
};

const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[]
): boolean => Object.keys(value).every((key) => allowed.includes(key));

const own = (value: Record<string, unknown>, key: string): boolean =>
  Object.hasOwn(value, key);

const optionalCount = (value: unknown, maximum: number): number | undefined =>
  value === undefined
    ? undefined
    : typeof value === 'number' &&
        Number.isSafeInteger(value) &&
        value >= 0 &&
        value <= maximum
      ? value
      : Number.NaN;

const canonicalValueText = (value: unknown): string | undefined => {
  try {
    return canonicalJsonText(value);
  } catch {
    return undefined;
  }
};

const compileCommon = (
  schema: Record<string, unknown>,
  budget: CompilationBudget
): CompiledCommon | undefined => {
  let constCanonicalText: string | undefined;
  if (own(schema, 'const')) {
    constCanonicalText = canonicalValueText(schema.const);
    if (constCanonicalText === undefined) return undefined;
  }
  let enumCanonicalTexts: ReadonlySet<string> | undefined;
  if (own(schema, 'enum')) {
    if (
      !exactDataArray(schema.enum) ||
      schema.enum.length < 1 ||
      schema.enum.length >
        CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumSchemaEnumItemsPerNode
    ) {
      return undefined;
    }
    budget.enumItems += schema.enum.length;
    if (
      budget.enumItems >
      CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumSchemaEnumItems
    ) {
      return undefined;
    }
    const texts = schema.enum.map(canonicalValueText);
    if (
      texts.some((text) => text === undefined) ||
      new Set(texts).size !== texts.length
    ) {
      return undefined;
    }
    enumCanonicalTexts = new Set(texts as string[]);
    if (
      constCanonicalText !== undefined &&
      !enumCanonicalTexts.has(constCanonicalText)
    ) {
      return undefined;
    }
  }
  return Object.freeze({
    ...(constCanonicalText === undefined ? {} : { constCanonicalText }),
    ...(enumCanonicalTexts === undefined ? {} : { enumCanonicalTexts }),
  });
};

const literalPatternBody = /^[A-Za-z0-9 _:@/-]*$/u;
const simpleClassPattern =
  /^\^\[([^\]\\^]{1,64})\]\{(\d{1,5})(?:,(\d{1,5}))?\}\$$/u;
const literalPrefixSimpleClassPattern =
  /^\^((?:[A-Za-z0-9 _:@/-]|\\\.){1,96})\[([^\]\\^]{1,64})\]\{(\d{1,5})(?:,(\d{1,5}))?\}\$$/u;

const validSimpleClassBody = (body: string): boolean => {
  for (let index = 0; index < body.length; index += 1) {
    const range = body.slice(index, index + 3);
    if (
      range === 'A-Z' ||
      range === 'a-z' ||
      range === 'A-F' ||
      range === 'a-f' ||
      range === '0-9'
    ) {
      index += 2;
      continue;
    }
    const character = body[index]!;
    if (!/[A-Za-z0-9._:@/ -]/u.test(character)) return false;
    if (character === '-' && index !== 0 && index !== body.length - 1) {
      return false;
    }
  }
  return true;
};

const compilePattern = (value: string): CompiledPattern | undefined => {
  if (
    [...value].length >
      CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumPatternLength ||
    !value.startsWith('^') ||
    !value.endsWith('$')
  ) {
    return undefined;
  }
  const literal = value.slice(1, -1);
  if (literalPatternBody.test(literal)) {
    const length = [...literal].length;
    return Object.freeze({
      kind: 'literal' as const,
      literal,
      minimumCodePoints: length,
      maximumCodePoints: length,
    });
  }
  const match = simpleClassPattern.exec(value);
  const prefixedMatch = literalPrefixSimpleClassPattern.exec(value);
  const classBody = match?.[1] ?? prefixedMatch?.[2];
  if (!classBody || !validSimpleClassBody(classBody)) return undefined;
  const minimum = Number(match?.[2] ?? prefixedMatch?.[3]);
  const maximumText = match?.[3] ?? prefixedMatch?.[4];
  const maximum = maximumText === undefined ? minimum : Number(maximumText);
  if (
    !Number.isSafeInteger(minimum) ||
    !Number.isSafeInteger(maximum) ||
    minimum > maximum ||
    maximum > CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumStringCodePoints
  ) {
    return undefined;
  }
  try {
    if (prefixedMatch) {
      const prefix = prefixedMatch[1]!.replaceAll('\\.', '.');
      const prefixLength = [...prefix].length;
      return Object.freeze({
        kind: 'literal-prefix-ascii-character-class' as const,
        prefix,
        suffixExpression: new RegExp(
          `^[${classBody}]{${minimum},${maximum}}$`,
          'u'
        ),
        minimumCodePoints: prefixLength + minimum,
        maximumCodePoints: prefixLength + maximum,
      });
    }
    return Object.freeze({
      kind: 'ascii-character-class' as const,
      expression: new RegExp(value, 'u'),
      minimumCodePoints: minimum,
      maximumCodePoints: maximum,
    });
  } catch {
    return undefined;
  }
};

const matchesCommon = (common: CompiledCommon, value: unknown): boolean => {
  if (
    common.constCanonicalText === undefined &&
    common.enumCanonicalTexts === undefined
  ) {
    return true;
  }
  const text = canonicalValueText(value);
  return (
    text !== undefined &&
    (common.constCanonicalText === undefined ||
      text === common.constCanonicalText) &&
    (common.enumCanonicalTexts === undefined ||
      common.enumCanonicalTexts.has(text))
  );
};

const matchesPattern = (pattern: CompiledPattern, value: string): boolean => {
  if (pattern.kind === 'literal') return value === pattern.literal;
  if (pattern.kind === 'literal-prefix-ascii-character-class') {
    return (
      value.startsWith(pattern.prefix) &&
      pattern.suffixExpression.test(value.slice(pattern.prefix.length))
    );
  }
  const match = pattern.expression.exec(value);
  return match?.[0] === value;
};

const matchesNode = (
  node: CompiledNode,
  value: unknown,
  includeCommon = true
): boolean => {
  if (includeCommon && !matchesCommon(node.common, value)) return false;
  if (node.kind === 'string') {
    if (typeof value !== 'string') return false;
    const length = [...value].length;
    return (
      length >= node.minimumLength &&
      length <= node.maximumLength &&
      (node.pattern === undefined || matchesPattern(node.pattern, value))
    );
  }
  if (node.kind === 'number') {
    return (
      typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      (node.minimum === undefined || value >= node.minimum) &&
      (node.maximum === undefined || value <= node.maximum)
    );
  }
  if (node.kind === 'boolean') return typeof value === 'boolean';
  if (node.kind === 'null') return value === null;
  if (node.kind === 'array') {
    if (
      !Array.isArray(value) ||
      value.length < node.minimumItems ||
      value.length > node.maximumItems ||
      !value.every((entry) => matchesNode(node.items, entry))
    ) {
      return false;
    }
    return (
      !node.uniqueItems ||
      new Set(value.map((entry) => canonicalJsonText(entry))).size ===
        value.length
    );
  }
  if (!exactDataRecord(value)) return false;
  const keys = Object.keys(value);
  if (
    keys.length < node.minimumProperties ||
    keys.length > node.maximumProperties ||
    [...node.required].some((key) => !own(value, key)) ||
    keys.some((key) => !node.properties.has(key))
  ) {
    return false;
  }
  return keys.every((key) =>
    matchesNode(node.properties.get(key)!, value[key])
  );
};

const commonIsCoherent = (
  node: CompiledNode,
  schema: Record<string, unknown>
): boolean => {
  if (own(schema, 'const') && !matchesNode(node, schema.const, false)) {
    return false;
  }
  return (
    !own(schema, 'enum') ||
    (schema.enum as readonly unknown[]).every((entry) =>
      matchesNode(node, entry, false)
    )
  );
};

const compileNode = (
  schemaValue: unknown,
  depth: number,
  budget: CompilationBudget
): CompiledNode | undefined => {
  budget.nodes += 1;
  if (
    depth > CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumSchemaDepth ||
    budget.nodes > CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumSchemaNodes ||
    !exactDataRecord(schemaValue) ||
    typeof schemaValue.type !== 'string'
  ) {
    return undefined;
  }
  const schema = schemaValue;
  const common = compileCommon(schema, budget);
  if (!common) return undefined;
  let node: CompiledNode | undefined;
  if (schema.type === 'string') {
    if (
      !hasOnlyKeys(schema, [
        'type',
        'const',
        'enum',
        'minLength',
        'maxLength',
        'pattern',
      ])
    ) {
      return undefined;
    }
    const minimum = optionalCount(
      schema.minLength,
      CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumStringCodePoints
    );
    const maximum = optionalCount(
      schema.maxLength,
      CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumStringCodePoints
    );
    if (Number.isNaN(minimum) || Number.isNaN(maximum)) return undefined;
    const pattern =
      schema.pattern === undefined
        ? undefined
        : typeof schema.pattern === 'string'
          ? compilePattern(schema.pattern)
          : undefined;
    if (schema.pattern !== undefined && pattern === undefined) return undefined;
    const minimumLength = Math.max(
      minimum ?? 0,
      pattern?.minimumCodePoints ?? 0
    );
    const maximumLength = Math.min(
      maximum ?? CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumStringCodePoints,
      pattern?.maximumCodePoints ??
        CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumStringCodePoints
    );
    if (minimumLength > maximumLength) return undefined;
    node = Object.freeze({
      kind: 'string' as const,
      common,
      minimumLength,
      maximumLength,
      ...(pattern === undefined ? {} : { pattern }),
    });
  } else if (schema.type === 'integer' || schema.type === 'number') {
    if (
      !hasOnlyKeys(schema, ['type', 'const', 'enum', 'minimum', 'maximum']) ||
      (schema.minimum !== undefined && !Number.isSafeInteger(schema.minimum)) ||
      (schema.maximum !== undefined && !Number.isSafeInteger(schema.maximum)) ||
      (typeof schema.minimum === 'number' &&
        typeof schema.maximum === 'number' &&
        schema.minimum > schema.maximum)
    ) {
      return undefined;
    }
    node = Object.freeze({
      kind: 'number' as const,
      common,
      ...(schema.minimum === undefined
        ? {}
        : { minimum: schema.minimum as number }),
      ...(schema.maximum === undefined
        ? {}
        : { maximum: schema.maximum as number }),
    });
  } else if (schema.type === 'boolean') {
    if (!hasOnlyKeys(schema, ['type', 'const', 'enum'])) return undefined;
    node = Object.freeze({ kind: 'boolean' as const, common });
  } else if (schema.type === 'null') {
    if (!hasOnlyKeys(schema, ['type', 'const', 'enum'])) return undefined;
    node = Object.freeze({ kind: 'null' as const, common });
  } else if (schema.type === 'array') {
    if (
      !hasOnlyKeys(schema, [
        'type',
        'const',
        'enum',
        'items',
        'minItems',
        'maxItems',
        'uniqueItems',
      ]) ||
      !own(schema, 'items') ||
      (schema.uniqueItems !== undefined &&
        typeof schema.uniqueItems !== 'boolean')
    ) {
      return undefined;
    }
    const minimum = optionalCount(
      schema.minItems,
      CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumArgumentArrayItemsPerArray
    );
    const maximum = optionalCount(
      schema.maxItems,
      CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumArgumentArrayItemsPerArray
    );
    if (
      Number.isNaN(minimum) ||
      Number.isNaN(maximum) ||
      (minimum ?? 0) >
        (maximum ??
          CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumArgumentArrayItemsPerArray)
    ) {
      return undefined;
    }
    const items = compileNode(schema.items, depth + 1, budget);
    if (!items) return undefined;
    node = Object.freeze({
      kind: 'array' as const,
      common,
      items,
      minimumItems: minimum ?? 0,
      maximumItems:
        maximum ??
        CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumArgumentArrayItemsPerArray,
      uniqueItems: schema.uniqueItems === true,
    });
  } else if (schema.type === 'object') {
    if (
      !hasOnlyKeys(schema, [
        'type',
        'const',
        'enum',
        'additionalProperties',
        'required',
        'properties',
        'minProperties',
        'maxProperties',
      ]) ||
      schema.additionalProperties !== false ||
      !exactDataRecord(schema.properties) ||
      !exactDataArray(schema.required) ||
      schema.required.some(
        (key) => typeof key !== 'string' || isUnsafeObjectKey(key)
      ) ||
      new Set(schema.required).size !== schema.required.length
    ) {
      return undefined;
    }
    const propertySchemas = schema.properties as Record<string, unknown>;
    const requiredProperties = schema.required as string[];
    const propertyEntries = Object.entries(propertySchemas);
    budget.properties += propertyEntries.length;
    if (
      propertyEntries.length >
        CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumSchemaPropertiesPerObject ||
      budget.properties >
        CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumSchemaProperties ||
      requiredProperties.some((key) => !own(propertySchemas, key))
    ) {
      return undefined;
    }
    const minimum = optionalCount(
      schema.minProperties,
      CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumSchemaPropertiesPerObject
    );
    const maximum = optionalCount(
      schema.maxProperties,
      CONTROLLED_WORKSPACE_SCHEMA_LIMITS.maximumSchemaPropertiesPerObject
    );
    const minimumProperties = Math.max(minimum ?? 0, requiredProperties.length);
    const maximumProperties = Math.min(
      maximum ?? propertyEntries.length,
      propertyEntries.length
    );
    if (minimumProperties > maximumProperties) return undefined;
    const properties = new Map<string, CompiledNode>();
    for (const [key, child] of propertyEntries) {
      const compiled = compileNode(child, depth + 1, budget);
      if (!compiled) return undefined;
      properties.set(key, compiled);
    }
    node = Object.freeze({
      kind: 'object' as const,
      common,
      properties,
      required: new Set(requiredProperties),
      minimumProperties,
      maximumProperties,
    });
  }
  return node && commonIsCoherent(node, schema) ? node : undefined;
};

/**
 * Compiles the complete strict-JSON Schema subset before any provider call.
 * The source schema remains digest-bound to the frozen trusted tool registry;
 * the compiled token is runtime-local and must be recreated after restart.
 */
export const compileControlledWorkspaceToolSchema = (
  schema: AgentJsonValue
): ControlledWorkspaceToolSchemaCompilation => {
  if (inspectBoundedJson(schema, schemaInspectionLimits) === undefined) {
    return invalidSchemaResult;
  }
  const budget: CompilationBudget = { nodes: 0, properties: 0, enumItems: 0 };
  const root = compileNode(schema, 0, budget);
  if (!root) return invalidSchemaResult;
  const compiledSchema = Object.freeze({
    format:
      'prodivix.agent-evaluation-controlled-workspace-compiled-schema' as const,
    version: 1 as const,
  });
  compiledRoots.set(compiledSchema, root);
  return Object.freeze({ ok: true as const, compiledSchema });
};

export const validateControlledWorkspaceCompiledToolArguments = (
  compiledSchema: ControlledWorkspaceCompiledToolSchema,
  value: AgentJsonValue
): ControlledWorkspaceSchemaValidation => {
  const root = compiledRoots.get(compiledSchema);
  if (!root) return invalidSchemaResult;
  if (inspectBoundedJson(value, argumentInspectionLimits) === undefined) {
    return invalidArgumentsResult;
  }
  return matchesNode(root, value) ? validResult : invalidArgumentsResult;
};

/**
 * Convenience boundary for callers that do not retain the compiled AST. A
 * schema defect is reported independently from a valid-schema argument miss.
 */
export const validateControlledWorkspaceToolArguments = (
  schema: AgentJsonValue,
  value: AgentJsonValue
): ControlledWorkspaceSchemaValidation => {
  const compilation = compileControlledWorkspaceToolSchema(schema);
  return compilation.ok
    ? validateControlledWorkspaceCompiledToolArguments(
        compilation.compiledSchema,
        value
      )
    : compilation;
};
