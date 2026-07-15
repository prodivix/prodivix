import {
  DESIGN_TOKEN_DECODE_ISSUE_CODES,
  formatDesignTokenPath,
  type DesignToken,
  type DesignTokenDecodeIssue,
  type DesignTokenDecodeResult,
  type DesignTokenDeprecated,
  type DesignTokenDocument,
  type DesignTokenGroup,
  type DesignTokenJsonValue,
  type DesignTokenReference,
  type DesignTokenReferenceTarget,
  type DesignTokenValueReference,
} from './designToken.types';

export const DTCG_DESIGN_TOKEN_FORMAT_PROFILE = Object.freeze({
  id: 'dtcg-design-tokens',
  version: '2025.10',
  mediaType: 'application/design-tokens+json',
  fileExtensions: Object.freeze(['.tokens', '.tokens.json']),
});

const GROUP_PROPERTIES = new Set([
  '$description',
  '$type',
  '$extends',
  '$deprecated',
  '$extensions',
]);
const TOKEN_PROPERTIES = new Set([
  '$value',
  '$ref',
  '$description',
  '$type',
  '$deprecated',
  '$extensions',
]);

type JsonRecord = Readonly<Record<string, DesignTokenJsonValue>>;

type RawGroup = {
  path: readonly string[];
  parentPath?: readonly string[];
  raw: JsonRecord;
  description?: string;
  declaredTypeRef?: string;
  declaredDeprecated?: DesignTokenDeprecated;
  extensions?: JsonRecord;
  extendsRaw?: string;
  extends?: DesignTokenReference;
};

type RawToken = {
  name: string;
  path: readonly string[];
  groupPath: readonly string[];
  sourceKind: 'value' | 'reference';
  value?: DesignTokenJsonValue;
  topReferenceRaw?: string;
  description?: string;
  declaredTypeRef?: string;
  declaredDeprecated?: DesignTokenDeprecated;
  extensions?: JsonRecord;
  references: DesignTokenValueReference[];
  directReference?: DesignTokenReference;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const escapePointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const toPointer = (segments: readonly string[]): string =>
  segments.length === 0
    ? '/'
    : `/${segments.map(escapePointerSegment).join('/')}`;

const appendIssue = (
  issues: DesignTokenDecodeIssue[],
  issue: DesignTokenDecodeIssue
): void => {
  issues.push(Object.freeze(issue));
};

const cloneJsonValue = (
  value: unknown,
  path: string,
  issues: DesignTokenDecodeIssue[],
  ancestors: Set<object>
): DesignTokenJsonValue | undefined => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || value === null) {
    appendIssue(issues, {
      code: DESIGN_TOKEN_DECODE_ISSUE_CODES.documentInvalid,
      path,
      message: 'Design token documents may contain only JSON values.',
    });
    return undefined;
  }
  if (ancestors.has(value)) {
    appendIssue(issues, {
      code: DESIGN_TOKEN_DECODE_ISSUE_CODES.documentInvalid,
      path,
      message: 'Design token documents must not contain object cycles.',
    });
    return undefined;
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    const cloned = value.map((item, index) =>
      cloneJsonValue(item, `${path}/${index}`, issues, ancestors)
    );
    ancestors.delete(value);
    if (cloned.some((item) => item === undefined)) return undefined;
    return Object.freeze(cloned as DesignTokenJsonValue[]);
  }
  if (!isRecord(value)) {
    ancestors.delete(value);
    appendIssue(issues, {
      code: DESIGN_TOKEN_DECODE_ISSUE_CODES.documentInvalid,
      path,
      message: 'Design token objects must use plain JSON object records.',
    });
    return undefined;
  }
  const entries: [string, DesignTokenJsonValue][] = [];
  for (const [key, item] of Object.entries(value)) {
    const cloned = cloneJsonValue(
      item,
      `${path === '/' ? '' : path}/${escapePointerSegment(key)}`,
      issues,
      ancestors
    );
    if (cloned !== undefined) entries.push([key, cloned]);
  }
  ancestors.delete(value);
  return Object.freeze(Object.fromEntries(entries));
};

const isValidName = (name: string): boolean =>
  Boolean(name) &&
  !name.startsWith('$') &&
  !name.includes('.') &&
  !name.includes('{') &&
  !name.includes('}');

const readOptionalString = (
  source: JsonRecord,
  property: '$description' | '$type',
  path: string,
  issues: DesignTokenDecodeIssue[]
): string | undefined => {
  const value = source[property];
  if (value === undefined) return undefined;
  if (typeof value === 'string' && (property !== '$type' || value.length > 0)) {
    return value;
  }
  appendIssue(issues, {
    code: DESIGN_TOKEN_DECODE_ISSUE_CODES.propertyInvalid,
    path: `${path === '/' ? '' : path}/${property}`,
    message: `${property} must be ${property === '$type' ? 'a non-empty' : 'a'} JSON string.`,
  });
  return undefined;
};

const readDeprecated = (
  source: JsonRecord,
  path: string,
  issues: DesignTokenDecodeIssue[]
): DesignTokenDeprecated | undefined => {
  const value = source.$deprecated;
  if (value === undefined) return undefined;
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  appendIssue(issues, {
    code: DESIGN_TOKEN_DECODE_ISSUE_CODES.propertyInvalid,
    path: `${path === '/' ? '' : path}/$deprecated`,
    message: '$deprecated must be a boolean or a JSON string.',
  });
  return undefined;
};

const readExtensions = (
  source: JsonRecord,
  path: string,
  issues: DesignTokenDecodeIssue[]
): JsonRecord | undefined => {
  const value = source.$extensions;
  if (value === undefined) return undefined;
  if (isRecord(value)) return value as JsonRecord;
  appendIssue(issues, {
    code: DESIGN_TOKEN_DECODE_ISSUE_CODES.propertyInvalid,
    path: `${path === '/' ? '' : path}/$extensions`,
    message: '$extensions must be a JSON object.',
  });
  return undefined;
};

const readReferenceString = (
  value: DesignTokenJsonValue | undefined,
  path: string,
  issues: DesignTokenDecodeIssue[]
): string | undefined => {
  if (typeof value === 'string' && value.length > 0) return value;
  appendIssue(issues, {
    code: DESIGN_TOKEN_DECODE_ISSUE_CODES.referenceInvalid,
    path,
    message: 'Design token references must be non-empty JSON strings.',
  });
  return undefined;
};

const parseToken = (
  name: string,
  path: readonly string[],
  groupPath: readonly string[],
  source: JsonRecord,
  issues: DesignTokenDecodeIssue[]
): RawToken | null => {
  const pointer = toPointer(path);
  const unknownProperty = Object.keys(source).find(
    (property) => !TOKEN_PROPERTIES.has(property)
  );
  if (unknownProperty) {
    appendIssue(issues, {
      code: unknownProperty.startsWith('$')
        ? DESIGN_TOKEN_DECODE_ISSUE_CODES.reservedPropertyInvalid
        : DESIGN_TOKEN_DECODE_ISSUE_CODES.nodeInvalid,
      path: `${pointer}/${escapePointerSegment(unknownProperty)}`,
      message: unknownProperty.startsWith('$')
        ? `Reserved token property ${unknownProperty} is not supported by the active DTCG profile.`
        : 'An object with $value or $ref cannot also contain child tokens or groups.',
    });
  }
  const hasValue = Object.hasOwn(source, '$value');
  const hasReference = Object.hasOwn(source, '$ref');
  if (hasValue === hasReference) {
    appendIssue(issues, {
      code: DESIGN_TOKEN_DECODE_ISSUE_CODES.nodeInvalid,
      path: pointer,
      message: 'A token must declare exactly one of $value or $ref.',
    });
    return null;
  }
  const topReferenceRaw = hasReference
    ? readReferenceString(source.$ref, `${pointer}/$ref`, issues)
    : undefined;
  const description = readOptionalString(
    source,
    '$description',
    pointer,
    issues
  );
  const declaredTypeRef = readOptionalString(source, '$type', pointer, issues);
  const declaredDeprecated = readDeprecated(source, pointer, issues);
  const extensions = readExtensions(source, pointer, issues);
  return {
    name,
    path: Object.freeze([...path]),
    groupPath: Object.freeze([...groupPath]),
    sourceKind: hasReference ? 'reference' : 'value',
    ...(hasValue ? { value: source.$value } : {}),
    ...(topReferenceRaw ? { topReferenceRaw } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(declaredTypeRef !== undefined ? { declaredTypeRef } : {}),
    ...(declaredDeprecated !== undefined ? { declaredDeprecated } : {}),
    ...(extensions ? { extensions } : {}),
    references: [],
  };
};

const parseGroup = (
  path: readonly string[],
  source: JsonRecord,
  groups: RawGroup[],
  tokens: RawToken[],
  issues: DesignTokenDecodeIssue[]
): void => {
  const pointer = toPointer(path);
  const description = readOptionalString(
    source,
    '$description',
    pointer,
    issues
  );
  const declaredTypeRef = readOptionalString(source, '$type', pointer, issues);
  const declaredDeprecated = readDeprecated(source, pointer, issues);
  const extensions = readExtensions(source, pointer, issues);
  const extendsRaw = Object.hasOwn(source, '$extends')
    ? readReferenceString(
        source.$extends,
        `${pointer === '/' ? '' : pointer}/$extends`,
        issues
      )
    : undefined;
  groups.push({
    path: Object.freeze([...path]),
    ...(path.length > 0
      ? { parentPath: Object.freeze(path.slice(0, -1)) }
      : {}),
    raw: source,
    ...(description !== undefined ? { description } : {}),
    ...(declaredTypeRef !== undefined ? { declaredTypeRef } : {}),
    ...(declaredDeprecated !== undefined ? { declaredDeprecated } : {}),
    ...(extensions ? { extensions } : {}),
    ...(extendsRaw ? { extendsRaw } : {}),
  });

  for (const [name, child] of Object.entries(source)) {
    if (GROUP_PROPERTIES.has(name)) continue;
    if (name.startsWith('$') && name !== '$root') {
      appendIssue(issues, {
        code: DESIGN_TOKEN_DECODE_ISSUE_CODES.reservedPropertyInvalid,
        path: `${pointer === '/' ? '' : pointer}/${escapePointerSegment(name)}`,
        message: `Reserved group property ${name} is not supported by the active DTCG profile.`,
      });
      continue;
    }
    if (name !== '$root' && !isValidName(name)) {
      appendIssue(issues, {
        code: DESIGN_TOKEN_DECODE_ISSUE_CODES.nameInvalid,
        path: `${pointer === '/' ? '' : pointer}/${escapePointerSegment(name)}`,
        message:
          'Token and group names must be non-empty, must not start with $, and must not contain periods or braces.',
      });
      continue;
    }
    if (!isRecord(child)) {
      appendIssue(issues, {
        code: DESIGN_TOKEN_DECODE_ISSUE_CODES.nodeInvalid,
        path: `${pointer === '/' ? '' : pointer}/${escapePointerSegment(name)}`,
        message: 'Each group child must be a token or nested group object.',
      });
      continue;
    }
    const childPath = Object.freeze([...path, name]);
    if (Object.hasOwn(child, '$value') || Object.hasOwn(child, '$ref')) {
      const token = parseToken(
        name,
        childPath,
        path,
        child as JsonRecord,
        issues
      );
      if (token) tokens.push(token);
      continue;
    }
    if (name === '$root') {
      appendIssue(issues, {
        code: DESIGN_TOKEN_DECODE_ISSUE_CODES.nodeInvalid,
        path: toPointer(childPath),
        message:
          '$root is reserved for a root token and must declare $value or $ref.',
      });
      continue;
    }
    parseGroup(childPath, child as JsonRecord, groups, tokens, issues);
  }
};

const decodeJsonPointer = (raw: string): readonly string[] | null => {
  if (raw === '#') return Object.freeze([]);
  if (!raw.startsWith('#/')) return null;
  const decoded: string[] = [];
  for (const segment of raw.slice(2).split('/')) {
    if (/~(?:[^01]|$)/.test(segment)) return null;
    decoded.push(segment.replaceAll('~1', '/').replaceAll('~0', '~'));
  }
  return Object.freeze(decoded);
};

const parseCurlyPath = (raw: string): readonly string[] | null => {
  const match = /^\{([^{}]+)\}$/.exec(raw);
  if (!match) return null;
  const path = match[1]!.split('.');
  if (
    path.some(
      (segment, index) =>
        !isValidName(segment) &&
        !(segment === '$root' && index === path.length - 1)
    )
  ) {
    return null;
  }
  return Object.freeze(path);
};

const isPathPrefix = (
  prefix: readonly string[],
  value: readonly string[]
): boolean =>
  prefix.length <= value.length &&
  prefix.every((segment, index) => segment === value[index]);

const getAtPointer = (
  root: DesignTokenJsonValue,
  path: readonly string[]
): DesignTokenJsonValue | undefined => {
  let current: DesignTokenJsonValue = root;
  for (const segment of path) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(segment)) return undefined;
      const index = Number(segment);
      if (index >= current.length) return undefined;
      current = current[index]!;
      continue;
    }
    if (!isRecord(current) || !Object.hasOwn(current, segment)) {
      return undefined;
    }
    current = current[segment] as DesignTokenJsonValue;
  }
  return current;
};

const createJsonPointerTarget = (
  pointerPath: readonly string[],
  tokensByPath: ReadonlyMap<string, RawToken>,
  groupsByPath: ReadonlyMap<string, RawGroup>
): DesignTokenReferenceTarget => {
  const token = [...tokensByPath.values()]
    .sort((left, right) => right.path.length - left.path.length)
    .find(
      (candidate) =>
        isPathPrefix(candidate.path, pointerPath) &&
        (pointerPath.length === candidate.path.length ||
          pointerPath[candidate.path.length] === '$value' ||
          pointerPath[candidate.path.length] === '$ref')
    );
  if (token) {
    const marker = pointerPath[token.path.length];
    return Object.freeze({
      kind: 'token',
      tokenPath: token.path,
      valuePath: Object.freeze(
        marker === '$value' || marker === '$ref'
          ? pointerPath.slice(token.path.length + 1)
          : []
      ),
    });
  }
  const group = groupsByPath.get(formatDesignTokenPath(pointerPath));
  if (group) {
    return Object.freeze({ kind: 'group', groupPath: group.path });
  }
  return Object.freeze({
    kind: 'document-location',
    pointerPath: Object.freeze([...pointerPath]),
  });
};

const resolveReference = (
  raw: string,
  path: string,
  purpose: 'token' | 'group',
  root: DesignTokenJsonValue,
  tokensByPath: ReadonlyMap<string, RawToken>,
  groupsByPath: ReadonlyMap<string, RawGroup>,
  issues: DesignTokenDecodeIssue[]
): DesignTokenReference | null => {
  const curlyPath = parseCurlyPath(raw);
  if (curlyPath) {
    const key = formatDesignTokenPath(curlyPath);
    const target =
      purpose === 'group' ? groupsByPath.get(key) : tokensByPath.get(key);
    if (!target) {
      appendIssue(issues, {
        code: DESIGN_TOKEN_DECODE_ISSUE_CODES.referenceMissing,
        path,
        message: `${purpose === 'group' ? 'Group' : 'Token'} reference ${raw} does not resolve in this document.`,
      });
      return null;
    }
    return Object.freeze({
      syntax: 'curly',
      raw,
      target: Object.freeze(
        purpose === 'group'
          ? { kind: 'group' as const, groupPath: target.path }
          : {
              kind: 'token' as const,
              tokenPath: target.path,
              valuePath: Object.freeze([]),
            }
      ),
    });
  }

  const pointerPath = decodeJsonPointer(raw);
  if (!pointerPath) {
    appendIssue(issues, {
      code: DESIGN_TOKEN_DECODE_ISSUE_CODES.referenceInvalid,
      path,
      message:
        purpose === 'group'
          ? 'Group extensions must use a valid curly token path or RFC 6901 JSON Pointer.'
          : 'References must use a valid curly token path or RFC 6901 JSON Pointer.',
    });
    return null;
  }
  if (getAtPointer(root, pointerPath) === undefined) {
    appendIssue(issues, {
      code: DESIGN_TOKEN_DECODE_ISSUE_CODES.referenceMissing,
      path,
      message: `JSON Pointer ${raw} does not resolve in this document.`,
    });
    return null;
  }
  const target = createJsonPointerTarget(
    pointerPath,
    tokensByPath,
    groupsByPath
  );
  if (purpose === 'group' && target.kind !== 'group') {
    appendIssue(issues, {
      code: DESIGN_TOKEN_DECODE_ISSUE_CODES.referenceTargetInvalid,
      path,
      message: `Group extension ${raw} must resolve to a group.`,
    });
    return null;
  }
  return Object.freeze({ syntax: 'json-pointer', raw, target });
};

const collectValueReferences = (
  value: DesignTokenJsonValue,
  valuePath: readonly string[],
  tokenPointer: string,
  root: DesignTokenJsonValue,
  tokensByPath: ReadonlyMap<string, RawToken>,
  groupsByPath: ReadonlyMap<string, RawGroup>,
  issues: DesignTokenDecodeIssue[],
  references: DesignTokenValueReference[]
): void => {
  if (typeof value === 'string') {
    if (!/^\{[^{}]+\}$/.test(value)) return;
    const reference = resolveReference(
      value,
      `${tokenPointer}/$value${toPointer(valuePath) === '/' ? '' : toPointer(valuePath)}`,
      'token',
      root,
      tokensByPath,
      groupsByPath,
      issues
    );
    if (reference) {
      references.push(
        Object.freeze({
          valuePath: Object.freeze([...valuePath]),
          reference,
        })
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectValueReferences(
        item,
        [...valuePath, String(index)],
        tokenPointer,
        root,
        tokensByPath,
        groupsByPath,
        issues,
        references
      )
    );
    return;
  }
  if (!isRecord(value)) return;
  if (Object.hasOwn(value, '$ref')) {
    const raw = readReferenceString(
      value.$ref as DesignTokenJsonValue,
      `${tokenPointer}/$value${toPointer([...valuePath, '$ref'])}`,
      issues
    );
    if (raw) {
      const reference = resolveReference(
        raw,
        `${tokenPointer}/$value${toPointer([...valuePath, '$ref'])}`,
        'token',
        root,
        tokensByPath,
        groupsByPath,
        issues
      );
      if (reference) {
        references.push(
          Object.freeze({
            valuePath: Object.freeze([...valuePath]),
            reference,
          })
        );
      }
    }
  }
  for (const [key, item] of Object.entries(value)) {
    if (key === '$ref') continue;
    collectValueReferences(
      item,
      [...valuePath, key],
      tokenPointer,
      root,
      tokensByPath,
      groupsByPath,
      issues,
      references
    );
  }
};

const findCycleNodes = (
  graph: ReadonlyMap<string, readonly string[]>
): ReadonlySet<string> => {
  const states = new Map<string, 'visiting' | 'visited'>();
  const stack: string[] = [];
  const cycleNodes = new Set<string>();
  const visit = (node: string): void => {
    const state = states.get(node);
    if (state === 'visited') return;
    if (state === 'visiting') {
      const start = stack.lastIndexOf(node);
      stack.slice(Math.max(0, start)).forEach((item) => cycleNodes.add(item));
      return;
    }
    states.set(node, 'visiting');
    stack.push(node);
    for (const target of graph.get(node) ?? []) visit(target);
    stack.pop();
    states.set(node, 'visited');
  };
  [...graph.keys()].sort(compareText).forEach(visit);
  return cycleNodes;
};

const compareIssues = (
  left: DesignTokenDecodeIssue,
  right: DesignTokenDecodeIssue
): number =>
  compareText(left.path, right.path) ||
  compareText(left.code, right.code) ||
  compareText(left.message, right.message);

const invalid = (issues: DesignTokenDecodeIssue[]): DesignTokenDecodeResult =>
  Object.freeze({
    ok: false,
    issues: Object.freeze([...issues].sort(compareIssues)),
  });

/**
 * Decodes the active DTCG wire profile into the versionless current Token
 * model. Unknown extension payloads stay intact while references, cycles and
 * effective token types are validated before the model reaches authoring.
 */
export const decodeDtcgDesignTokenDocument = (
  input: unknown
): DesignTokenDecodeResult => {
  const issues: DesignTokenDecodeIssue[] = [];
  const cloned = cloneJsonValue(input, '/', issues, new Set());
  if (!isRecord(cloned)) {
    if (issues.length === 0) {
      appendIssue(issues, {
        code: DESIGN_TOKEN_DECODE_ISSUE_CODES.documentInvalid,
        path: '/',
        message: 'A DTCG design token document must be a JSON object.',
      });
    }
    return invalid(issues);
  }

  const groups: RawGroup[] = [];
  const tokens: RawToken[] = [];
  parseGroup([], cloned as JsonRecord, groups, tokens, issues);
  if (issues.length > 0) return invalid(issues);

  const groupsByPath = new Map(
    groups.map((group) => [formatDesignTokenPath(group.path), group])
  );
  const tokensByPath = new Map(
    tokens.map((token) => [formatDesignTokenPath(token.path), token])
  );

  for (const group of groups) {
    if (!group.extendsRaw) continue;
    if (group.path.length === 0) {
      appendIssue(issues, {
        code: DESIGN_TOKEN_DECODE_ISSUE_CODES.referenceTargetInvalid,
        path: '/$extends',
        message:
          'The document root group cannot extend one of its descendants.',
      });
      continue;
    }
    const extension = resolveReference(
      group.extendsRaw,
      `${toPointer(group.path)}/$extends`,
      'group',
      cloned,
      tokensByPath,
      groupsByPath,
      issues
    );
    if (extension) group.extends = extension;
  }

  for (const token of tokens) {
    const pointer = toPointer(token.path);
    if (token.topReferenceRaw) {
      const reference = resolveReference(
        token.topReferenceRaw,
        `${pointer}/$ref`,
        'token',
        cloned,
        tokensByPath,
        groupsByPath,
        issues
      );
      if (reference) {
        token.directReference = reference;
        token.references.push(
          Object.freeze({ valuePath: Object.freeze([]), reference })
        );
      }
    } else if (token.value !== undefined) {
      collectValueReferences(
        token.value,
        [],
        pointer,
        cloned,
        tokensByPath,
        groupsByPath,
        issues,
        token.references
      );
      if (
        token.references.length === 1 &&
        (typeof token.value === 'string' ||
          (isRecord(token.value) &&
            Object.keys(token.value).length === 1 &&
            Object.hasOwn(token.value, '$ref')))
      ) {
        token.directReference = token.references[0]!.reference;
      }
    }
  }
  if (issues.length > 0) return invalid(issues);

  const groupGraph = new Map<string, readonly string[]>();
  groups.forEach((group) => {
    const target = group.extends?.target;
    groupGraph.set(
      formatDesignTokenPath(group.path),
      target?.kind === 'group'
        ? Object.freeze([formatDesignTokenPath(target.groupPath)])
        : Object.freeze([])
    );
  });
  for (const path of findCycleNodes(groupGraph)) {
    const group = groupsByPath.get(path)!;
    appendIssue(issues, {
      code: DESIGN_TOKEN_DECODE_ISSUE_CODES.groupExtensionCycle,
      path: `${toPointer(group.path)}/$extends`,
      message: `Group extension cycle includes ${path || '<root>'}.`,
    });
  }

  const tokenGraph = new Map<string, readonly string[]>();
  tokens.forEach((token) => {
    const targets = new Set<string>();
    token.references.forEach(({ reference }) => {
      if (reference.target.kind === 'token') {
        targets.add(formatDesignTokenPath(reference.target.tokenPath));
      }
    });
    tokenGraph.set(
      formatDesignTokenPath(token.path),
      Object.freeze([...targets].sort(compareText))
    );
  });
  for (const path of findCycleNodes(tokenGraph)) {
    const token = tokensByPath.get(path)!;
    appendIssue(issues, {
      code: DESIGN_TOKEN_DECODE_ISSUE_CODES.referenceCycle,
      path: toPointer(token.path),
      message: `Token reference cycle includes ${path}.`,
    });
  }
  if (issues.length > 0) return invalid(issues);

  const groupTypeCache = new Map<string, string | undefined>();
  const resolveGroupType = (group: RawGroup): string | undefined => {
    const key = formatDesignTokenPath(group.path);
    if (groupTypeCache.has(key)) return groupTypeCache.get(key);
    const extendedPath =
      group.extends?.target.kind === 'group'
        ? formatDesignTokenPath(group.extends.target.groupPath)
        : undefined;
    const parent = group.parentPath
      ? groupsByPath.get(formatDesignTokenPath(group.parentPath))
      : undefined;
    const resolved =
      group.declaredTypeRef ??
      (extendedPath
        ? resolveGroupType(groupsByPath.get(extendedPath)!)
        : undefined) ??
      (parent ? resolveGroupType(parent) : undefined);
    groupTypeCache.set(key, resolved);
    return resolved;
  };

  const groupDeprecatedCache = new Map<
    string,
    DesignTokenDeprecated | undefined
  >();
  const resolveGroupDeprecated = (
    group: RawGroup
  ): DesignTokenDeprecated | undefined => {
    const key = formatDesignTokenPath(group.path);
    if (groupDeprecatedCache.has(key)) return groupDeprecatedCache.get(key);
    const extended =
      group.extends?.target.kind === 'group'
        ? groupsByPath.get(
            formatDesignTokenPath(group.extends.target.groupPath)
          )
        : undefined;
    const parent = group.parentPath
      ? groupsByPath.get(formatDesignTokenPath(group.parentPath))
      : undefined;
    const resolved =
      group.declaredDeprecated ??
      (extended ? resolveGroupDeprecated(extended) : undefined) ??
      (parent ? resolveGroupDeprecated(parent) : undefined);
    groupDeprecatedCache.set(key, resolved);
    return resolved;
  };

  const tokenTypeCache = new Map<string, string | undefined>();
  const resolveTokenType = (token: RawToken): string | undefined => {
    const key = formatDesignTokenPath(token.path);
    if (tokenTypeCache.has(key)) return tokenTypeCache.get(key);
    const directTarget = token.directReference?.target;
    const targetToken =
      directTarget?.kind === 'token' && directTarget.valuePath.length === 0
        ? tokensByPath.get(formatDesignTokenPath(directTarget.tokenPath))
        : undefined;
    const group = groupsByPath.get(formatDesignTokenPath(token.groupPath))!;
    const resolved =
      token.declaredTypeRef ??
      (targetToken ? resolveTokenType(targetToken) : undefined) ??
      resolveGroupType(group);
    tokenTypeCache.set(key, resolved);
    return resolved;
  };

  for (const token of tokens) {
    const typeRef = resolveTokenType(token);
    if (!typeRef) {
      appendIssue(issues, {
        code: DESIGN_TOKEN_DECODE_ISSUE_CODES.typeMissing,
        path: toPointer(token.path),
        message: `Token ${formatDesignTokenPath(token.path)} has no explicit, inherited, or aliased type.`,
      });
      continue;
    }
    const directTarget = token.directReference?.target;
    if (
      token.declaredTypeRef &&
      directTarget?.kind === 'token' &&
      directTarget.valuePath.length === 0
    ) {
      const target = tokensByPath.get(
        formatDesignTokenPath(directTarget.tokenPath)
      );
      const targetType = target ? resolveTokenType(target) : undefined;
      if (targetType && targetType !== token.declaredTypeRef) {
        appendIssue(issues, {
          code: DESIGN_TOKEN_DECODE_ISSUE_CODES.typeMismatch,
          path: `${toPointer(token.path)}/$type`,
          message: `Token type ${token.declaredTypeRef} does not match referenced token type ${targetType}.`,
        });
      }
    }
  }
  if (issues.length > 0) return invalid(issues);

  const currentGroups: DesignTokenGroup[] = groups.map((group) => {
    const typeRef = resolveGroupType(group);
    const deprecated = resolveGroupDeprecated(group);
    return Object.freeze({
      ...(group.path.length > 0 ? { name: group.path.at(-1)! } : {}),
      path: group.path,
      ...(group.parentPath ? { parentPath: group.parentPath } : {}),
      ...(group.description !== undefined
        ? { description: group.description }
        : {}),
      ...(group.declaredTypeRef
        ? { declaredTypeRef: group.declaredTypeRef }
        : {}),
      ...(typeRef ? { typeRef } : {}),
      ...(group.declaredDeprecated !== undefined
        ? { declaredDeprecated: group.declaredDeprecated }
        : {}),
      ...(deprecated !== undefined ? { deprecated } : {}),
      ...(group.extensions ? { extensions: group.extensions } : {}),
      ...(group.extends ? { extends: group.extends } : {}),
    });
  });
  const currentTokens: DesignToken[] = tokens.map((token) => {
    const typeRef = resolveTokenType(token)!;
    const group = groupsByPath.get(formatDesignTokenPath(token.groupPath))!;
    const deprecated =
      token.declaredDeprecated ?? resolveGroupDeprecated(group);
    return Object.freeze({
      name: token.name,
      path: token.path,
      groupPath: token.groupPath,
      sourceKind: token.sourceKind,
      ...(token.value !== undefined ? { value: token.value } : {}),
      ...(token.directReference
        ? { directReference: token.directReference }
        : {}),
      references: Object.freeze(
        [...token.references].sort((left, right) =>
          compareText(
            `${formatDesignTokenPath(left.valuePath)}:${left.reference.raw}`,
            `${formatDesignTokenPath(right.valuePath)}:${right.reference.raw}`
          )
        )
      ),
      ...(token.description !== undefined
        ? { description: token.description }
        : {}),
      ...(token.declaredTypeRef
        ? { declaredTypeRef: token.declaredTypeRef }
        : {}),
      typeRef,
      ...(token.declaredDeprecated !== undefined
        ? { declaredDeprecated: token.declaredDeprecated }
        : {}),
      ...(deprecated !== undefined ? { deprecated } : {}),
      ...(token.extensions ? { extensions: token.extensions } : {}),
    });
  });

  const value: DesignTokenDocument = Object.freeze({
    groups: Object.freeze(
      currentGroups.sort((left, right) =>
        compareText(
          formatDesignTokenPath(left.path),
          formatDesignTokenPath(right.path)
        )
      )
    ),
    tokens: Object.freeze(
      currentTokens.sort((left, right) =>
        compareText(
          formatDesignTokenPath(left.path),
          formatDesignTokenPath(right.path)
        )
      )
    ),
  });
  return Object.freeze({ ok: true, value });
};

export const isDtcgDesignTokenDocument = (
  input: unknown
): input is Readonly<Record<string, DesignTokenJsonValue>> =>
  decodeDtcgDesignTokenDocument(input).ok;
