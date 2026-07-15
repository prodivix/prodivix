import {
  validatePirDocument,
  type PIRDocument,
  type PIRElementNode,
  type PIRJsonValue,
  type PIRValueBinding,
} from '@prodivix/pir';

export const CONTROLLED_CSS_NODE_ID_ATTRIBUTE =
  'data-prodivix-node-id' as const;
export const CONTROLLED_CSS_NUMBER_MARKER =
  '/* @prodivix-type=number */' as const;

export const CONTROLLED_CSS_ISSUE_CODES = Object.freeze({
  syntaxInvalid: 'CONTROLLED_CSS_SYNTAX_INVALID',
  shapeUnsupported: 'CONTROLLED_CSS_SHAPE_UNSUPPORTED',
  nodeInvalid: 'CONTROLLED_CSS_NODE_INVALID',
  bindingUnsupported: 'CONTROLLED_CSS_BINDING_UNSUPPORTED',
  graphInvalid: 'CONTROLLED_CSS_GRAPH_INVALID',
} as const);

export type ControlledCssIssueCode =
  (typeof CONTROLLED_CSS_ISSUE_CODES)[keyof typeof CONTROLLED_CSS_ISSUE_CODES];

export type ControlledCssIssue = Readonly<{
  code: ControlledCssIssueCode;
  path: string;
  message: string;
  nodeId?: string;
}>;

export type ControlledCssProjectionResult =
  | Readonly<{ status: 'ready'; body: string }>
  | Readonly<{ status: 'blocked'; issues: readonly ControlledCssIssue[] }>;

export type ControlledCssParseResult =
  | Readonly<{ status: 'ready'; document: PIRDocument; body: string }>
  | Readonly<{ status: 'blocked'; issues: readonly ControlledCssIssue[] }>;

type ParsedDeclaration = Readonly<{
  propertyName: string;
  value: PIRJsonValue;
}>;

type ParsedRule = Readonly<{
  nodeId: string;
  declarations: readonly ParsedDeclaration[];
}>;

const STYLE_NAME_PATTERN =
  /^(?:--[A-Za-z0-9_-]+|(?:[a-z]|Webkit|Moz|ms|O)[A-Za-z0-9]*)$/;
const CSS_PROPERTY_PATTERN = /^(?:--[A-Za-z0-9_-]+|-?[a-z][a-z0-9-]*)$/;
const NUMBER_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const JSON_VALUE_PATTERN = /^prodivix-json\("([A-Za-z0-9_.!~*'()%+-]*)"\)$/;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const compareIssues = (
  left: ControlledCssIssue,
  right: ControlledCssIssue
): number =>
  compareText(left.path, right.path) ||
  compareText(left.code, right.code) ||
  compareText(left.nodeId ?? '', right.nodeId ?? '') ||
  compareText(left.message, right.message);

const blocked = (
  issues: readonly ControlledCssIssue[]
): Readonly<{ status: 'blocked'; issues: readonly ControlledCssIssue[] }> => ({
  status: 'blocked',
  issues: [...issues].sort(compareIssues),
});

const strictEncodeURIComponent = (value: string): string =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );

const isJsonValue = (value: unknown): value is PIRJsonValue => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return Boolean(
    value &&
    typeof value === 'object' &&
    Object.values(value).every(isJsonValue)
  );
};

const toCssPropertyName = (styleName: string): string | undefined => {
  if (!STYLE_NAME_PATTERN.test(styleName)) return undefined;
  if (styleName.startsWith('--')) return styleName;
  const vendor = styleName.startsWith('Webkit')
    ? { css: '-webkit-', length: 6 }
    : styleName.startsWith('Moz')
      ? { css: '-moz-', length: 3 }
      : styleName.startsWith('ms')
        ? { css: '-ms-', length: 2 }
        : styleName.startsWith('O')
          ? { css: '-o-', length: 1 }
          : undefined;
  const unprefixed = vendor ? styleName.slice(vendor.length) : styleName;
  const kebab = unprefixed
    .replace(/([A-Z])/g, '-$1')
    .replace(/^-/, '')
    .toLowerCase();
  return `${vendor?.css ?? ''}${kebab}`;
};

const capitalize = (value: string): string =>
  value ? `${value[0]!.toUpperCase()}${value.slice(1)}` : value;

const fromCssPropertyName = (propertyName: string): string | undefined => {
  if (!CSS_PROPERTY_PATTERN.test(propertyName)) return undefined;
  if (propertyName.startsWith('--')) return propertyName;
  const vendor = propertyName.startsWith('-webkit-')
    ? { prefix: 'Webkit', length: 8 }
    : propertyName.startsWith('-moz-')
      ? { prefix: 'Moz', length: 5 }
      : propertyName.startsWith('-ms-')
        ? { prefix: 'ms', length: 4 }
        : propertyName.startsWith('-o-')
          ? { prefix: 'O', length: 3 }
          : undefined;
  const source = vendor ? propertyName.slice(vendor.length) : propertyName;
  const camel = source.replace(/-([a-z0-9])/g, (_, character: string) =>
    character.toUpperCase()
  );
  return vendor ? `${vendor.prefix}${capitalize(camel)}` : camel;
};

const escapeCssString = (value: string): string => {
  let result = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (character === '"' || character === '\\') {
      result += `\\${character}`;
    } else if (codePoint === 0) {
      result += '\\FFFD ';
    } else if (
      codePoint <= 0x1f ||
      codePoint === 0x7f ||
      character === '\n' ||
      character === '\r' ||
      character === '\f'
    ) {
      result += `\\${codePoint.toString(16).toUpperCase()} `;
    } else {
      result += character;
    }
  }
  return result;
};

const unescapeCssString = (value: string): string | undefined => {
  let result = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (character !== '\\') {
      result += character;
      continue;
    }
    index += 1;
    if (index >= value.length) return undefined;
    const escaped = value[index]!;
    if (/[0-9a-fA-F]/.test(escaped)) {
      let hex = escaped;
      while (
        hex.length < 6 &&
        index + 1 < value.length &&
        /[0-9a-fA-F]/.test(value[index + 1]!)
      ) {
        index += 1;
        hex += value[index]!;
      }
      if (index + 1 < value.length && /\s/.test(value[index + 1]!)) index += 1;
      const codePoint = Number.parseInt(hex, 16);
      if (!Number.isFinite(codePoint) || codePoint > 0x10ffff) return undefined;
      result += String.fromCodePoint(codePoint === 0 ? 0xfffd : codePoint);
      continue;
    }
    if (escaped === '\n' || escaped === '\r' || escaped === '\f') continue;
    result += escaped;
  }
  return result;
};

const isSafeCssStringValue = (value: string): boolean => {
  if (
    value.length === 0 ||
    value !== value.trim() ||
    NUMBER_PATTERN.test(value) ||
    value.startsWith('prodivix-json(') ||
    value.includes('/*') ||
    value.includes('*/') ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return false;
  }
  let quote: '"' | "'" | undefined;
  let parentheses = 0;
  let brackets = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (character === '\\') {
      if (index + 1 >= value.length) return false;
      index += 1;
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '(') parentheses += 1;
    else if (character === ')') parentheses -= 1;
    else if (character === '[') brackets += 1;
    else if (character === ']') brackets -= 1;
    else if (
      character === '{' ||
      character === '}' ||
      (character === ';' && parentheses === 0 && brackets === 0)
    ) {
      return false;
    }
    if (parentheses < 0 || brackets < 0) return false;
  }
  return !quote && parentheses === 0 && brackets === 0;
};

const encodeCssValue = (
  value: PIRJsonValue
): Readonly<{ source: string; number: boolean }> => {
  if (typeof value === 'number') {
    return {
      source: Object.is(value, -0) ? '-0' : String(value),
      number: true,
    };
  }
  if (typeof value === 'string' && isSafeCssStringValue(value)) {
    return { source: value, number: false };
  }
  return {
    source: `prodivix-json("${strictEncodeURIComponent(JSON.stringify(value))}")`,
    number: false,
  };
};

const decodeCssValue = (
  source: string,
  number: boolean
): Readonly<{ ok: true; value: PIRJsonValue }> | Readonly<{ ok: false }> => {
  const value = source.trim();
  if (number || NUMBER_PATTERN.test(value)) {
    if (!NUMBER_PATTERN.test(value)) return { ok: false };
    const parsed = Number(value);
    return Number.isFinite(parsed)
      ? { ok: true, value: parsed }
      : { ok: false };
  }
  const encodedJson = value.match(JSON_VALUE_PATTERN)?.[1];
  if (encodedJson !== undefined) {
    try {
      const parsed: unknown = JSON.parse(decodeURIComponent(encodedJson));
      return isJsonValue(parsed) ? { ok: true, value: parsed } : { ok: false };
    } catch {
      return { ok: false };
    }
  }
  return { ok: true, value };
};

const literalStyles = (
  node: PIRElementNode
): readonly Readonly<{
  styleName: string;
  propertyName: string;
  value: PIRJsonValue;
}>[] =>
  Object.entries(node.style ?? {})
    .filter(([, binding]) => binding.kind === 'literal')
    .map(([styleName, binding]) => ({
      styleName,
      propertyName: toCssPropertyName(styleName) ?? '',
      value: binding.kind === 'literal' ? binding.value : null,
    }))
    .sort((left, right) => compareText(left.propertyName, right.propertyName));

const validateControlledDocument = (
  document: PIRDocument
): readonly ControlledCssIssue[] => {
  const validation = validatePirDocument(document);
  if (!validation.valid) {
    return validation.issues.map((issue) => ({
      code: CONTROLLED_CSS_ISSUE_CODES.graphInvalid,
      path: issue.path,
      message: issue.message,
    }));
  }
  const issues: ControlledCssIssue[] = [];
  for (const [nodeId, node] of Object.entries(document.ui.graph.nodesById)) {
    if (node.kind !== 'element') continue;
    for (const entry of literalStyles(node)) {
      if (entry.propertyName) continue;
      issues.push({
        code: CONTROLLED_CSS_ISSUE_CODES.bindingUnsupported,
        path: `/ui/graph/nodesById/${nodeId}/style/${entry.styleName}`,
        message: `Style "${entry.styleName}" cannot be represented as a CSS property.`,
        nodeId,
      });
    }
  }
  return issues;
};

const renderRule = (node: PIRElementNode): string => {
  const declarations = literalStyles(node).map((entry) => {
    const encoded = encodeCssValue(entry.value);
    return `  ${entry.propertyName}: ${encoded.source};${
      encoded.number ? ` ${CONTROLLED_CSS_NUMBER_MARKER}` : ''
    }`;
  });
  return `[${CONTROLLED_CSS_NODE_ID_ATTRIBUTE}="${escapeCssString(node.id)}"] {${
    declarations.length > 0 ? `\n${declarations.join('\n')}\n` : '\n'
  }}`;
};

/** Projects literal PIR style bindings to a standalone canonical stylesheet. */
export const projectPirDocumentToControlledCss = (
  document: PIRDocument
): ControlledCssProjectionResult => {
  const issues = validateControlledDocument(document);
  if (issues.length > 0) return blocked(issues);
  const rules = Object.values(document.ui.graph.nodesById)
    .filter((node): node is PIRElementNode => node.kind === 'element')
    .sort((left, right) => compareText(left.id, right.id))
    .map(renderRule);
  return { status: 'ready', body: rules.join('\n\n') };
};

const findRuleEnd = (
  source: string,
  bodyFrom: number
): Readonly<{ ok: true; bodyTo: number; ruleTo: number }> | undefined => {
  let quote: '"' | "'" | undefined;
  let parentheses = 0;
  let comment = false;
  for (let index = bodyFrom; index < source.length; index += 1) {
    const character = source[index]!;
    const next = source[index + 1];
    if (comment) {
      if (character === '*' && next === '/') {
        comment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === '/' && next === '*') {
      comment = true;
      index += 1;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '(') {
      parentheses += 1;
    } else if (character === ')') {
      parentheses -= 1;
      if (parentheses < 0) return undefined;
    } else if (character === '}' && parentheses === 0) {
      return { ok: true, bodyTo: index, ruleTo: index + 1 };
    } else if (character === '{' && parentheses === 0) {
      return undefined;
    }
  }
  return undefined;
};

const readDeclarationEnd = (
  source: string,
  from: number
): number | undefined => {
  let quote: '"' | "'" | undefined;
  let parentheses = 0;
  let comment = false;
  for (let index = from; index < source.length; index += 1) {
    const character = source[index]!;
    const next = source[index + 1];
    if (comment) {
      if (character === '*' && next === '/') {
        comment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === '/' && next === '*') {
      comment = true;
      index += 1;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '(') {
      parentheses += 1;
    } else if (character === ')') {
      parentheses -= 1;
      if (parentheses < 0) return undefined;
    } else if (character === ';' && parentheses === 0) {
      return index;
    }
  }
  return undefined;
};

const parseDeclarations = (
  source: string,
  nodeId: string,
  path: string
):
  | Readonly<{ ok: true; declarations: readonly ParsedDeclaration[] }>
  | Readonly<{ ok: false; issues: readonly ControlledCssIssue[] }> => {
  const declarations: ParsedDeclaration[] = [];
  const issues: ControlledCssIssue[] = [];
  const names = new Set<string>();
  let index = 0;
  while (index < source.length) {
    while (index < source.length && /\s/.test(source[index]!)) index += 1;
    if (index >= source.length) break;
    const colon = source.indexOf(':', index);
    if (colon < 0) {
      issues.push({
        code: CONTROLLED_CSS_ISSUE_CODES.syntaxInvalid,
        path,
        message:
          'Each controlled CSS declaration requires a property name and value.',
        nodeId,
      });
      break;
    }
    const propertyName = source.slice(index, colon).trim();
    const styleName = fromCssPropertyName(propertyName);
    const end = readDeclarationEnd(source, colon + 1);
    if (!styleName || end === undefined) {
      issues.push({
        code: CONTROLLED_CSS_ISSUE_CODES.syntaxInvalid,
        path: `${path}/${declarations.length}`,
        message: !styleName
          ? `CSS property "${propertyName}" is outside the controlled style subset.`
          : 'Controlled CSS declarations must end with a semicolon.',
        nodeId,
      });
      break;
    }
    let next = end + 1;
    while (next < source.length && /\s/.test(source[next]!)) next += 1;
    const hasNumberMarker = source.startsWith(
      CONTROLLED_CSS_NUMBER_MARKER,
      next
    );
    if (hasNumberMarker) next += CONTROLLED_CSS_NUMBER_MARKER.length;
    const decoded = decodeCssValue(
      source.slice(colon + 1, end),
      hasNumberMarker
    );
    if (!decoded.ok) {
      issues.push({
        code: CONTROLLED_CSS_ISSUE_CODES.bindingUnsupported,
        path: `${path}/${declarations.length}/value`,
        message: `Style "${styleName}" contains an invalid controlled value.`,
        nodeId,
      });
    } else if (names.has(styleName)) {
      issues.push({
        code: CONTROLLED_CSS_ISSUE_CODES.nodeInvalid,
        path: `${path}/${declarations.length}/property`,
        message: `Style "${styleName}" is declared more than once.`,
        nodeId,
      });
    } else {
      names.add(styleName);
      declarations.push({ propertyName: styleName, value: decoded.value });
    }
    index = next;
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, declarations };
};

const parseRules = (
  body: string
):
  | Readonly<{ ok: true; rules: readonly ParsedRule[] }>
  | Readonly<{ ok: false; issues: readonly ControlledCssIssue[] }> => {
  const rules: ParsedRule[] = [];
  const issues: ControlledCssIssue[] = [];
  const nodeIds = new Set<string>();
  let index = 0;
  while (index < body.length) {
    while (index < body.length && /\s/.test(body[index]!)) index += 1;
    if (index >= body.length) break;
    const selector = body
      .slice(index)
      .match(/^\[data-prodivix-node-id="((?:\\.|[^"\\])*)"\]\s*\{/);
    if (!selector) {
      issues.push({
        code: CONTROLLED_CSS_ISSUE_CODES.shapeUnsupported,
        path: `/rules/${rules.length}/selector`,
        message:
          'Controlled CSS rules must target exactly one data-prodivix-node-id selector.',
      });
      break;
    }
    const nodeId = unescapeCssString(selector[1]!);
    const bodyFrom = index + selector[0].length;
    const end = findRuleEnd(body, bodyFrom);
    if (!nodeId || !end) {
      issues.push({
        code: CONTROLLED_CSS_ISSUE_CODES.syntaxInvalid,
        path: `/rules/${rules.length}`,
        message: !nodeId
          ? 'Controlled CSS contains an invalid node id escape.'
          : 'Controlled CSS contains an unclosed or nested rule.',
        ...(nodeId ? { nodeId } : {}),
      });
      break;
    }
    const parsed = parseDeclarations(
      body.slice(bodyFrom, end.bodyTo),
      nodeId,
      `/rules/${rules.length}/declarations`
    );
    if (!parsed.ok) issues.push(...parsed.issues);
    else if (nodeIds.has(nodeId)) {
      issues.push({
        code: CONTROLLED_CSS_ISSUE_CODES.nodeInvalid,
        path: `/rules/${rules.length}/selector`,
        message: `Controlled CSS node id "${nodeId}" appears more than once.`,
        nodeId,
      });
    } else {
      nodeIds.add(nodeId);
      rules.push({ nodeId, declarations: parsed.declarations });
    }
    index = end.ruleTo;
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, rules };
};

const nonLiteralBindings = (
  bindings: Readonly<Record<string, PIRValueBinding>> | undefined
): Readonly<Record<string, PIRValueBinding>> =>
  Object.fromEntries(
    Object.entries(bindings ?? {}).filter(
      ([, binding]) => binding.kind !== 'literal'
    )
  );

/** Parses standalone controlled CSS and updates only literal PIR style bindings. */
export const parseControlledCssToPirDocument = (input: {
  body: string;
  baseDocument: PIRDocument;
}): ControlledCssParseResult => {
  const parsed = parseRules(input.body);
  if (!parsed.ok) return blocked(parsed.issues);
  const baseElements = Object.values(input.baseDocument.ui.graph.nodesById)
    .filter((node): node is PIRElementNode => node.kind === 'element')
    .sort((left, right) => compareText(left.id, right.id));
  const baseIds = new Set(baseElements.map((node) => node.id));
  const ruleIds = new Set(parsed.rules.map((rule) => rule.nodeId));
  const issues: ControlledCssIssue[] = [];
  for (const rule of parsed.rules) {
    if (baseIds.has(rule.nodeId)) continue;
    issues.push({
      code: CONTROLLED_CSS_ISSUE_CODES.nodeInvalid,
      path: `/rules/${rule.nodeId}`,
      message: `CSS cannot create unknown PIR node "${rule.nodeId}".`,
      nodeId: rule.nodeId,
    });
  }
  for (const node of baseElements) {
    if (ruleIds.has(node.id)) continue;
    issues.push({
      code: CONTROLLED_CSS_ISSUE_CODES.nodeInvalid,
      path: `/ui/graph/nodesById/${node.id}`,
      message: `Controlled CSS requires one rule for PIR node "${node.id}".`,
      nodeId: node.id,
    });
  }
  if (issues.length > 0) return blocked(issues);

  const nodesById = { ...input.baseDocument.ui.graph.nodesById };
  for (const rule of parsed.rules) {
    const node = nodesById[rule.nodeId] as PIRElementNode;
    const protectedStyles = nonLiteralBindings(node.style);
    for (const declaration of rule.declarations) {
      if (!Object.hasOwn(protectedStyles, declaration.propertyName)) continue;
      issues.push({
        code: CONTROLLED_CSS_ISSUE_CODES.bindingUnsupported,
        path: `/rules/${rule.nodeId}/declarations/${declaration.propertyName}`,
        message: `Style "${declaration.propertyName}" is owned by a non-literal PIR binding.`,
        nodeId: rule.nodeId,
      });
    }
    const literalStyles = Object.fromEntries(
      rule.declarations.map((declaration) => [
        declaration.propertyName,
        { kind: 'literal' as const, value: declaration.value },
      ])
    );
    const style = { ...protectedStyles, ...literalStyles };
    const { style: _previousStyle, ...nodeWithoutStyle } = node;
    nodesById[rule.nodeId] =
      Object.keys(style).length > 0
        ? { ...nodeWithoutStyle, style }
        : nodeWithoutStyle;
  }
  if (issues.length > 0) return blocked(issues);
  const document: PIRDocument = {
    ...input.baseDocument,
    ui: {
      ...input.baseDocument.ui,
      graph: { ...input.baseDocument.ui.graph, nodesById },
    },
  };
  const validationIssues = validateControlledDocument(document);
  if (validationIssues.length > 0) return blocked(validationIssues);
  const projection = projectPirDocumentToControlledCss(document);
  if (projection.status === 'blocked') return projection;
  return { status: 'ready', document, body: projection.body };
};
