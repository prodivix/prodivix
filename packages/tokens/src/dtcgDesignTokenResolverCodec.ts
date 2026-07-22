import {
  DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES,
  type DesignTokenResolverContext,
  type DesignTokenResolverDecodeIssue,
  type DesignTokenResolverDecodeResult,
  type DesignTokenResolverDocument,
  type DesignTokenResolverModifier,
  type DesignTokenResolverOrderEntry,
  type DesignTokenResolverReference,
  type DesignTokenResolverReferenceTarget,
  type DesignTokenResolverSet,
  type DesignTokenResolverSource,
} from './designTokenResolver.types';
import type {
  DesignTokenJsonObject,
  DesignTokenJsonValue,
} from './designToken.types';
import { decodeDtcgDesignTokenDocument } from './dtcgDesignTokenCodec';

export const DTCG_DESIGN_TOKEN_RESOLVER_PROFILE = Object.freeze({
  id: 'dtcg-design-token-resolver',
  version: '2025.10',
  mediaType: 'application/json',
  fileExtension: '.resolver.json',
});

type JsonRecord = Readonly<Record<string, DesignTokenJsonValue>>;

const ROOT_PROPERTIES = new Set([
  '$schema',
  'name',
  'version',
  'description',
  'sets',
  'modifiers',
  'resolutionOrder',
]);
const SET_PROPERTIES = new Set(['sources', 'description', '$extensions']);
const MODIFIER_PROPERTIES = new Set([
  'contexts',
  'description',
  'default',
  '$extensions',
]);
const INLINE_PROPERTIES = new Set(['name', 'type']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const escapePointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const appendIssue = (
  issues: DesignTokenResolverDecodeIssue[],
  issue: DesignTokenResolverDecodeIssue
): void => {
  issues.push(Object.freeze(issue));
};

const cloneJsonValue = (
  value: unknown,
  path: string,
  issues: DesignTokenResolverDecodeIssue[],
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
  if (!value || typeof value !== 'object') {
    appendIssue(issues, {
      code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.documentInvalid,
      path,
      message: 'Resolver documents may contain only JSON values.',
    });
    return undefined;
  }
  if (ancestors.has(value)) {
    appendIssue(issues, {
      code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.documentInvalid,
      path,
      message: 'Resolver documents must not contain object cycles.',
    });
    return undefined;
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    const items = value.map((item, index) =>
      cloneJsonValue(item, `${path}/${index}`, issues, ancestors)
    );
    ancestors.delete(value);
    if (items.some((item) => item === undefined)) return undefined;
    return Object.freeze(items as DesignTokenJsonValue[]);
  }
  if (!isRecord(value)) {
    ancestors.delete(value);
    appendIssue(issues, {
      code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.documentInvalid,
      path,
      message: 'Resolver objects must use plain JSON records.',
    });
    return undefined;
  }
  const entries: [string, DesignTokenJsonValue][] = [];
  for (const [key, child] of Object.entries(value)) {
    const cloned = cloneJsonValue(
      child,
      `${path === '/' ? '' : path}/${escapePointerSegment(key)}`,
      issues,
      ancestors
    );
    if (cloned !== undefined) entries.push([key, cloned]);
  }
  ancestors.delete(value);
  return Object.freeze(Object.fromEntries(entries));
};

const cloneJsonObject = (
  value: unknown,
  path: string,
  issues: DesignTokenResolverDecodeIssue[]
): DesignTokenJsonObject | undefined => {
  if (!isRecord(value)) {
    appendIssue(issues, {
      code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.documentInvalid,
      path,
      message: 'Expected a JSON object.',
    });
    return undefined;
  }
  const cloned = cloneJsonValue(value, path, issues, new Set());
  return cloned && !Array.isArray(cloned) && typeof cloned === 'object'
    ? (cloned as DesignTokenJsonObject)
    : undefined;
};

const readOptionalString = (
  source: JsonRecord,
  property: 'name' | 'description',
  path: string,
  issues: DesignTokenResolverDecodeIssue[]
): string | undefined => {
  const value = source[property];
  if (value === undefined) return undefined;
  if (
    typeof value === 'string' &&
    (property === 'description' || value.trim())
  ) {
    return value;
  }
  appendIssue(issues, {
    code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.propertyInvalid,
    path: `${path}/${property}`,
    message: `${property} must be ${property === 'name' ? 'a non-empty ' : 'a '}JSON string.`,
  });
  return undefined;
};

const readExtensions = (
  source: JsonRecord,
  path: string,
  issues: DesignTokenResolverDecodeIssue[]
): Readonly<Record<string, DesignTokenJsonValue>> | undefined => {
  const value = source.$extensions;
  if (value === undefined) return undefined;
  if (isRecord(value)) {
    return cloneJsonObject(value, `${path}/$extensions`, issues);
  }
  appendIssue(issues, {
    code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.propertyInvalid,
    path: `${path}/$extensions`,
    message: '$extensions must be a JSON object.',
  });
  return undefined;
};

const assertAllowedProperties = (
  source: JsonRecord,
  allowed: ReadonlySet<string>,
  path: string,
  issues: DesignTokenResolverDecodeIssue[]
): void => {
  Object.keys(source)
    .filter((property) => !allowed.has(property))
    .forEach((property) =>
      appendIssue(issues, {
        code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.propertyInvalid,
        path: `${path}/${escapePointerSegment(property)}`,
        message: `Property ${property} is not part of the active DTCG Resolver profile.`,
      })
    );
};

const decodePointer = (raw: string): readonly string[] | null => {
  if (raw === '#') return Object.freeze([]);
  if (!raw.startsWith('#/')) return null;
  const result: string[] = [];
  for (const segment of raw.slice(2).split('/')) {
    if (/~(?:[^01]|$)/.test(segment)) return null;
    result.push(segment.replaceAll('~1', '/').replaceAll('~0', '~'));
  }
  return Object.freeze(result);
};

const parseReferenceTarget = (
  raw: string,
  path: string,
  issues: DesignTokenResolverDecodeIssue[]
): DesignTokenResolverReferenceTarget | null => {
  if (!raw.startsWith('#')) {
    const fragmentIndex = raw.indexOf('#');
    const documentPath = fragmentIndex < 0 ? raw : raw.slice(0, fragmentIndex);
    const fragment =
      fragmentIndex < 0 ? undefined : raw.slice(fragmentIndex + 1);
    if (!documentPath.trim()) {
      appendIssue(issues, {
        code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.referenceInvalid,
        path,
        message: 'External resolver references must declare a document path.',
      });
      return null;
    }
    return Object.freeze({
      kind: 'document',
      documentPath,
      ...(fragment !== undefined ? { fragment } : {}),
    });
  }

  const pointerPath = decodePointer(raw);
  if (!pointerPath) {
    appendIssue(issues, {
      code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.referenceInvalid,
      path,
      message:
        'Same-document resolver references must use an RFC 6901 JSON Pointer.',
    });
    return null;
  }
  if (pointerPath[0] === 'resolutionOrder') {
    appendIssue(issues, {
      code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.referenceTargetInvalid,
      path,
      message: 'Resolver references must not point into resolutionOrder.',
    });
    return null;
  }
  if (pointerPath.length === 2 && pointerPath[0] === 'sets') {
    return Object.freeze({ kind: 'set', setName: pointerPath[1]! });
  }
  if (pointerPath.length === 2 && pointerPath[0] === 'modifiers') {
    return Object.freeze({ kind: 'modifier', modifierName: pointerPath[1]! });
  }
  return Object.freeze({ kind: 'document-location', pointerPath });
};

const parseReference = (
  source: JsonRecord,
  path: string,
  issues: DesignTokenResolverDecodeIssue[]
): DesignTokenResolverReference | null => {
  const raw = source.$ref;
  if (typeof raw !== 'string' || !raw.trim()) {
    appendIssue(issues, {
      code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.referenceInvalid,
      path: `${path}/$ref`,
      message: '$ref must be a non-empty JSON string.',
    });
    return null;
  }
  const target = parseReferenceTarget(raw, `${path}/$ref`, issues);
  if (!target) return null;
  const overrideEntries = Object.entries(source).filter(
    ([property]) => property !== '$ref'
  );
  const overrides =
    overrideEntries.length > 0
      ? cloneJsonObject(Object.fromEntries(overrideEntries), path, issues)
      : undefined;
  return Object.freeze({
    raw,
    target,
    ...(overrides ? { overrides } : {}),
  });
};

const parseSource = (
  value: DesignTokenJsonValue,
  path: string,
  issues: DesignTokenResolverDecodeIssue[]
): DesignTokenResolverSource | null => {
  if (!isRecord(value)) {
    appendIssue(issues, {
      code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.sourceInvalid,
      path,
      message:
        'Resolver sources must be reference objects or inline DTCG token objects.',
    });
    return null;
  }
  if (Object.hasOwn(value, '$ref')) {
    const reference = parseReference(value as JsonRecord, path, issues);
    return reference ? Object.freeze({ kind: 'reference', reference }) : null;
  }

  const raw = cloneJsonObject(value, path, issues);
  const decoded = decodeDtcgDesignTokenDocument(value);
  if (!decoded.ok) {
    decoded.issues.forEach((issue) =>
      appendIssue(issues, {
        code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.inlineTokenInvalid,
        path: `${path}${issue.path === '/' ? '' : issue.path}`,
        message: issue.message,
      })
    );
    return null;
  }
  return raw
    ? Object.freeze({ kind: 'inline', document: decoded.value, raw })
    : null;
};

const parseSources = (
  value: DesignTokenJsonValue | undefined,
  path: string,
  issues: DesignTokenResolverDecodeIssue[]
): readonly DesignTokenResolverSource[] => {
  if (!Array.isArray(value)) {
    appendIssue(issues, {
      code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.sourceInvalid,
      path,
      message: 'sources must be an array.',
    });
    return Object.freeze([]);
  }
  return Object.freeze(
    value
      .map((source, index) => parseSource(source, `${path}/${index}`, issues))
      .filter((source): source is DesignTokenResolverSource => Boolean(source))
  );
};

const parseSet = (
  name: string,
  source: JsonRecord,
  path: string,
  inline: boolean,
  issues: DesignTokenResolverDecodeIssue[]
): DesignTokenResolverSet => {
  assertAllowedProperties(
    source,
    inline
      ? new Set([...SET_PROPERTIES, ...INLINE_PROPERTIES])
      : SET_PROPERTIES,
    path,
    issues
  );
  const description = readOptionalString(source, 'description', path, issues);
  const extensions = readExtensions(source, path, issues);
  return Object.freeze({
    name,
    sources: parseSources(source.sources, `${path}/sources`, issues),
    ...(description !== undefined ? { description } : {}),
    ...(extensions ? { extensions } : {}),
  });
};

const parseModifier = (
  name: string,
  source: JsonRecord,
  path: string,
  inline: boolean,
  issues: DesignTokenResolverDecodeIssue[]
): DesignTokenResolverModifier => {
  assertAllowedProperties(
    source,
    inline
      ? new Set([...MODIFIER_PROPERTIES, ...INLINE_PROPERTIES])
      : MODIFIER_PROPERTIES,
    path,
    issues
  );
  const description = readOptionalString(source, 'description', path, issues);
  const extensions = readExtensions(source, path, issues);
  const contextsValue = source.contexts;
  const contexts: DesignTokenResolverContext[] = [];
  if (!isRecord(contextsValue) || Object.keys(contextsValue).length === 0) {
    appendIssue(issues, {
      code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.modifierInvalid,
      path: `${path}/contexts`,
      message: 'A modifier must declare a non-empty contexts object.',
    });
  } else {
    const caseFolded = new Set<string>();
    Object.entries(contextsValue)
      .sort(([left], [right]) => compareText(left, right))
      .forEach(([contextName, value]) => {
        const folded = contextName.toLocaleLowerCase('en-US');
        if (!contextName.trim() || caseFolded.has(folded)) {
          appendIssue(issues, {
            code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.contextInvalid,
            path: `${path}/contexts/${escapePointerSegment(contextName)}`,
            message:
              'Modifier context names must be non-empty and unique without regard to case.',
          });
          return;
        }
        caseFolded.add(folded);
        contexts.push(
          Object.freeze({
            name: contextName,
            sources: parseSources(
              value as DesignTokenJsonValue,
              `${path}/contexts/${escapePointerSegment(contextName)}`,
              issues
            ),
          })
        );
      });
  }

  let defaultContext: string | undefined;
  if (source.default !== undefined) {
    if (typeof source.default !== 'string' || !source.default.trim()) {
      appendIssue(issues, {
        code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.propertyInvalid,
        path: `${path}/default`,
        message: 'Modifier default must be a non-empty JSON string.',
      });
    } else {
      const requestedDefault = source.default;
      defaultContext = contexts.find(
        (context) =>
          context.name.toLocaleLowerCase('en-US') ===
          requestedDefault.toLocaleLowerCase('en-US')
      )?.name;
      if (!defaultContext) {
        appendIssue(issues, {
          code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.contextInvalid,
          path: `${path}/default`,
          message: `Modifier default ${requestedDefault} does not name one of its contexts.`,
        });
      }
    }
  }

  return Object.freeze({
    name,
    contexts: Object.freeze(contexts),
    ...(description !== undefined ? { description } : {}),
    ...(defaultContext ? { defaultContext } : {}),
    ...(extensions ? { extensions } : {}),
  });
};

const parseNamedDefinitions = <Definition>(
  value: DesignTokenJsonValue | undefined,
  property: 'sets' | 'modifiers',
  issues: DesignTokenResolverDecodeIssue[],
  parse: (
    name: string,
    source: JsonRecord,
    path: string,
    inline: boolean,
    issues: DesignTokenResolverDecodeIssue[]
  ) => Definition
): Readonly<{
  definitions: readonly Definition[];
  rawByName: ReadonlyMap<string, JsonRecord>;
}> => {
  if (value === undefined) {
    return Object.freeze({
      definitions: Object.freeze([]),
      rawByName: new Map(),
    });
  }
  if (!isRecord(value)) {
    appendIssue(issues, {
      code:
        property === 'sets'
          ? DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.setInvalid
          : DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.modifierInvalid,
      path: `/${property}`,
      message: `${property} must be a JSON object.`,
    });
    return Object.freeze({
      definitions: Object.freeze([]),
      rawByName: new Map(),
    });
  }
  const definitions: Definition[] = [];
  const rawByName = new Map<string, JsonRecord>();
  const caseFolded = new Set<string>();
  Object.entries(value)
    .sort(([left], [right]) => compareText(left, right))
    .forEach(([name, definition]) => {
      const path = `/${property}/${escapePointerSegment(name)}`;
      const folded = name.toLocaleLowerCase('en-US');
      if (!name.trim() || caseFolded.has(folded)) {
        appendIssue(issues, {
          code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.nameInvalid,
          path,
          message:
            'Resolver definition names must be non-empty and unique without regard to case.',
        });
        return;
      }
      caseFolded.add(folded);
      if (!isRecord(definition)) {
        appendIssue(issues, {
          code:
            property === 'sets'
              ? DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.setInvalid
              : DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.modifierInvalid,
          path,
          message: `Each ${property === 'sets' ? 'set' : 'modifier'} must be a JSON object.`,
        });
        return;
      }
      const raw = definition as JsonRecord;
      rawByName.set(name, raw);
      definitions.push(parse(name, raw, path, false, issues));
    });
  return Object.freeze({
    definitions: Object.freeze(definitions),
    rawByName,
  });
};

const findName = <Definition extends { name: string }>(
  definitions: readonly Definition[],
  requested: string
): Definition | undefined =>
  definitions.find(
    (definition) =>
      definition.name.toLocaleLowerCase('en-US') ===
      requested.toLocaleLowerCase('en-US')
  );

const parseResolutionOrder = (
  value: DesignTokenJsonValue | undefined,
  sets: readonly DesignTokenResolverSet[],
  modifiers: readonly DesignTokenResolverModifier[],
  setRawByName: ReadonlyMap<string, JsonRecord>,
  modifierRawByName: ReadonlyMap<string, JsonRecord>,
  issues: DesignTokenResolverDecodeIssue[]
): readonly DesignTokenResolverOrderEntry[] => {
  if (!Array.isArray(value)) {
    appendIssue(issues, {
      code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.orderInvalid,
      path: '/resolutionOrder',
      message: 'resolutionOrder must be an array.',
    });
    return Object.freeze([]);
  }
  const result: DesignTokenResolverOrderEntry[] = [];
  const orderNames = new Set<string>();
  value.forEach((entry, index) => {
    const path = `/resolutionOrder/${index}`;
    if (!isRecord(entry)) {
      appendIssue(issues, {
        code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.orderInvalid,
        path,
        message:
          'Each resolutionOrder entry must be a reference, set, or modifier object.',
      });
      return;
    }
    if (Object.hasOwn(entry, '$ref')) {
      const reference = parseReference(entry as JsonRecord, path, issues);
      if (!reference) return;
      if (
        reference.target.kind !== 'set' &&
        reference.target.kind !== 'modifier'
      ) {
        appendIssue(issues, {
          code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.referenceTargetInvalid,
          path: `${path}/$ref`,
          message:
            'Prodivix resolutionOrder references must target a same-document set or modifier.',
        });
        return;
      }
      if (reference.target.kind === 'set') {
        const existing = findName(sets, reference.target.setName);
        const raw = existing ? setRawByName.get(existing.name) : undefined;
        if (!existing || !raw) {
          appendIssue(issues, {
            code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.referenceMissing,
            path: `${path}/$ref`,
            message: `Set ${reference.target.setName} does not exist.`,
          });
          return;
        }
        const definition = reference.overrides
          ? parseSet(
              existing.name,
              { ...raw, ...reference.overrides },
              path,
              false,
              issues
            )
          : existing;
        result.push(
          Object.freeze({
            kind: 'set',
            name: existing.name,
            declaration: 'reference',
            definition,
          })
        );
        return;
      }
      const existing = findName(modifiers, reference.target.modifierName);
      const raw = existing ? modifierRawByName.get(existing.name) : undefined;
      if (!existing || !raw) {
        appendIssue(issues, {
          code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.referenceMissing,
          path: `${path}/$ref`,
          message: `Modifier ${reference.target.modifierName} does not exist.`,
        });
        return;
      }
      const definition = reference.overrides
        ? parseModifier(
            existing.name,
            { ...raw, ...reference.overrides },
            path,
            false,
            issues
          )
        : existing;
      result.push(
        Object.freeze({
          kind: 'modifier',
          name: existing.name,
          declaration: 'reference',
          definition,
        })
      );
      return;
    }

    const type = entry.type;
    const name = entry.name;
    if (
      (type !== 'set' && type !== 'modifier') ||
      typeof name !== 'string' ||
      !name.trim()
    ) {
      appendIssue(issues, {
        code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.orderInvalid,
        path,
        message:
          'Inline resolutionOrder entries require type "set" or "modifier" and a non-empty name.',
      });
      return;
    }
    const foldedName = name.toLocaleLowerCase('en-US');
    if (orderNames.has(foldedName)) {
      appendIssue(issues, {
        code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.orderInvalid,
        path: `${path}/name`,
        message:
          'Inline resolutionOrder names must be unique without regard to case.',
      });
      return;
    }
    orderNames.add(foldedName);
    if (type === 'set') {
      result.push(
        Object.freeze({
          kind: 'set',
          name,
          declaration: 'inline',
          definition: parseSet(name, entry as JsonRecord, path, true, issues),
        })
      );
    } else {
      result.push(
        Object.freeze({
          kind: 'modifier',
          name,
          declaration: 'inline',
          definition: parseModifier(
            name,
            entry as JsonRecord,
            path,
            true,
            issues
          ),
        })
      );
    }
  });
  return Object.freeze(result);
};

const collectSetTargets = (
  sources: readonly DesignTokenResolverSource[]
): readonly string[] =>
  Object.freeze(
    sources.flatMap((source) =>
      source.kind === 'reference' && source.reference.target.kind === 'set'
        ? [source.reference.target.setName]
        : []
    )
  );

const validateReferences = (
  sets: readonly DesignTokenResolverSet[],
  modifiers: readonly DesignTokenResolverModifier[],
  issues: DesignTokenResolverDecodeIssue[]
): void => {
  const setNames = new Map(
    sets.map((set) => [set.name.toLocaleLowerCase('en-US'), set.name])
  );
  const validateSources = (
    sources: readonly DesignTokenResolverSource[],
    path: string
  ) => {
    sources.forEach((source, index) => {
      if (source.kind !== 'reference') return;
      const target = source.reference.target;
      if (target.kind === 'modifier') {
        appendIssue(issues, {
          code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.referenceTargetInvalid,
          path: `${path}/${index}/$ref`,
          message:
            'Sets and modifier contexts must not reference another modifier.',
        });
      }
      if (
        target.kind === 'set' &&
        !setNames.has(target.setName.toLocaleLowerCase('en-US'))
      ) {
        appendIssue(issues, {
          code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.referenceMissing,
          path: `${path}/${index}/$ref`,
          message: `Set ${target.setName} does not exist.`,
        });
      }
    });
  };
  sets.forEach((set) =>
    validateSources(
      set.sources,
      `/sets/${escapePointerSegment(set.name)}/sources`
    )
  );
  modifiers.forEach((modifier) =>
    modifier.contexts.forEach((context) =>
      validateSources(
        context.sources,
        `/modifiers/${escapePointerSegment(modifier.name)}/contexts/${escapePointerSegment(context.name)}`
      )
    )
  );

  const graph = new Map(
    sets.map((set) => [
      set.name.toLocaleLowerCase('en-US'),
      collectSetTargets(set.sources).map((name) =>
        name.toLocaleLowerCase('en-US')
      ),
    ])
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cyclic = new Set<string>();
  const stack: string[] = [];
  const visit = (name: string) => {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      stack.slice(stack.lastIndexOf(name)).forEach((item) => cyclic.add(item));
      return;
    }
    visiting.add(name);
    stack.push(name);
    (graph.get(name) ?? []).forEach(visit);
    stack.pop();
    visiting.delete(name);
    visited.add(name);
  };
  [...graph.keys()].sort(compareText).forEach(visit);
  [...cyclic].sort(compareText).forEach((name) =>
    appendIssue(issues, {
      code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.referenceCycle,
      path: `/sets/${escapePointerSegment(setNames.get(name) ?? name)}/sources`,
      message: 'Set references must not form a cycle.',
    })
  );
};

const calculatePermutationCount = (
  order: readonly DesignTokenResolverOrderEntry[]
): number => {
  const seen = new Set<string>();
  let count = 1;
  order.forEach((entry) => {
    if (entry.kind !== 'modifier') return;
    const key = entry.name.toLocaleLowerCase('en-US');
    if (seen.has(key)) return;
    seen.add(key);
    count = Math.min(
      Number.MAX_SAFE_INTEGER,
      count * entry.definition.contexts.length
    );
  });
  return count;
};

const compareIssues = (
  left: DesignTokenResolverDecodeIssue,
  right: DesignTokenResolverDecodeIssue
): number =>
  compareText(left.path, right.path) ||
  compareText(left.code, right.code) ||
  compareText(left.message, right.message);

/** Decodes the DTCG 2025.10 Resolver wire format into a stable current model. */
export const decodeDtcgDesignTokenResolverDocument = (
  input: unknown
): DesignTokenResolverDecodeResult => {
  const issues: DesignTokenResolverDecodeIssue[] = [];
  const cloned = cloneJsonObject(input, '/', issues);
  if (!cloned) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze(issues.sort(compareIssues)),
    });
  }
  const source = cloned as JsonRecord;
  assertAllowedProperties(source, ROOT_PROPERTIES, '', issues);
  if (source.version !== DTCG_DESIGN_TOKEN_RESOLVER_PROFILE.version) {
    appendIssue(issues, {
      code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.versionUnsupported,
      path: '/version',
      message: `Resolver version must be ${DTCG_DESIGN_TOKEN_RESOLVER_PROFILE.version} at the wire boundary.`,
    });
  }
  if (source.$schema !== undefined && typeof source.$schema !== 'string') {
    appendIssue(issues, {
      code: DESIGN_TOKEN_RESOLVER_DECODE_ISSUE_CODES.propertyInvalid,
      path: '/$schema',
      message: '$schema must be a JSON string when present.',
    });
  }
  const name = readOptionalString(source, 'name', '', issues);
  const description = readOptionalString(source, 'description', '', issues);
  const parsedSets = parseNamedDefinitions(
    source.sets,
    'sets',
    issues,
    parseSet
  );
  const parsedModifiers = parseNamedDefinitions(
    source.modifiers,
    'modifiers',
    issues,
    parseModifier
  );
  const resolutionOrder = parseResolutionOrder(
    source.resolutionOrder,
    parsedSets.definitions,
    parsedModifiers.definitions,
    parsedSets.rawByName,
    parsedModifiers.rawByName,
    issues
  );
  validateReferences(
    [
      ...parsedSets.definitions,
      ...resolutionOrder.flatMap((entry) =>
        entry.kind === 'set' && entry.declaration === 'inline'
          ? [entry.definition]
          : []
      ),
    ],
    [
      ...parsedModifiers.definitions,
      ...resolutionOrder.flatMap((entry) =>
        entry.kind === 'modifier' && entry.declaration === 'inline'
          ? [entry.definition]
          : []
      ),
    ],
    issues
  );
  if (issues.length > 0) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze(issues.sort(compareIssues)),
    });
  }
  const value: DesignTokenResolverDocument = Object.freeze({
    ...(name !== undefined ? { name } : {}),
    ...(description !== undefined ? { description } : {}),
    sets: parsedSets.definitions,
    modifiers: parsedModifiers.definitions,
    resolutionOrder,
    permutationCount: calculatePermutationCount(resolutionOrder),
  });
  return Object.freeze({ ok: true, value });
};

export const isDtcgDesignTokenResolverDocument = (
  input: unknown
): input is DesignTokenJsonObject =>
  decodeDtcgDesignTokenResolverDocument(input).ok;
