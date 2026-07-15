import * as ts from 'typescript';
import {
  validatePirDocument,
  type PIRComponentSlotOutletNode,
  type PIRDocument,
  type PIRElementNode,
  type PIRJsonObject,
  type PIRJsonValue,
  type PIRNode,
  type PIRValueBinding,
} from '@prodivix/pir';

export const CONTROLLED_REACT_JSX_NODE_ID_ATTRIBUTE =
  'data-prodivix-node-id' as const;
export const CONTROLLED_REACT_JSX_SLOT_MEMBER_ATTRIBUTE =
  'data-prodivix-slot-member-id' as const;

export const CONTROLLED_REACT_JSX_ISSUE_CODES = Object.freeze({
  syntaxInvalid: 'CONTROLLED_REACT_JSX_SYNTAX_INVALID',
  shapeUnsupported: 'CONTROLLED_REACT_JSX_SHAPE_UNSUPPORTED',
  nodeInvalid: 'CONTROLLED_REACT_JSX_NODE_INVALID',
  bindingUnsupported: 'CONTROLLED_REACT_JSX_BINDING_UNSUPPORTED',
  graphInvalid: 'CONTROLLED_REACT_JSX_GRAPH_INVALID',
} as const);

export type ControlledReactJsxIssueCode =
  (typeof CONTROLLED_REACT_JSX_ISSUE_CODES)[keyof typeof CONTROLLED_REACT_JSX_ISSUE_CODES];

export type ControlledReactJsxIssue = Readonly<{
  code: ControlledReactJsxIssueCode;
  path: string;
  message: string;
  nodeId?: string;
}>;

export type ControlledReactJsxProjectionResult =
  | Readonly<{ status: 'ready'; body: string }>
  | Readonly<{
      status: 'blocked';
      issues: readonly ControlledReactJsxIssue[];
    }>;

export type ControlledReactJsxParseResult =
  | Readonly<{ status: 'ready'; document: PIRDocument; body: string }>
  | Readonly<{
      status: 'blocked';
      issues: readonly ControlledReactJsxIssue[];
    }>;

const ELEMENT_TYPE_PATTERN = /^[A-Za-z][A-Za-z0-9_$.-]*$/;
const RESERVED_PROP_NAMES = new Set([
  CONTROLLED_REACT_JSX_NODE_ID_ATTRIBUTE,
  CONTROLLED_REACT_JSX_SLOT_MEMBER_ATTRIBUTE,
  'children',
  'style',
]);

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const compareIssues = (
  left: ControlledReactJsxIssue,
  right: ControlledReactJsxIssue
): number =>
  compareText(left.path, right.path) ||
  compareText(left.code, right.code) ||
  compareText(left.nodeId ?? '', right.nodeId ?? '') ||
  compareText(left.message, right.message);

const blocked = (
  issues: readonly ControlledReactJsxIssue[]
): Readonly<{
  status: 'blocked';
  issues: readonly ControlledReactJsxIssue[];
}> => ({ status: 'blocked', issues: [...issues].sort(compareIssues) });

const isRecord = (value: PIRJsonValue): value is PIRJsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeJsonValue = (value: PIRJsonValue): PIRJsonValue => {
  if (Array.isArray(value)) return value.map(normalizeJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, entry]) => [key, normalizeJsonValue(entry)])
  );
};

const toStableJson = (value: PIRJsonValue): string =>
  JSON.stringify(normalizeJsonValue(value));

const literalValues = (
  bindings: Readonly<Record<string, PIRValueBinding>> | undefined
): PIRJsonObject =>
  Object.fromEntries(
    Object.entries(bindings ?? {})
      .filter(([, binding]) => binding.kind === 'literal')
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, binding]) => [
        key,
        binding.kind === 'literal' ? binding.value : null,
      ])
  );

const bindingRecord = (
  values: PIRJsonObject
): Readonly<Record<string, PIRValueBinding>> =>
  Object.fromEntries(
    Object.entries(values)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, value]) => [key, { kind: 'literal' as const, value }])
  );

const nonLiteralBindings = (
  bindings: Readonly<Record<string, PIRValueBinding>> | undefined
): Readonly<Record<string, PIRValueBinding>> =>
  Object.fromEntries(
    Object.entries(bindings ?? {}).filter(
      ([, binding]) => binding.kind !== 'literal'
    )
  );

const validateControlledDocument = (
  document: PIRDocument
): readonly ControlledReactJsxIssue[] => {
  const issues: ControlledReactJsxIssue[] = [];
  const validation = validatePirDocument(document);
  if (!validation.valid) {
    issues.push(
      ...validation.issues.map((issue) => ({
        code: CONTROLLED_REACT_JSX_ISSUE_CODES.graphInvalid,
        path: issue.path,
        message: issue.message,
      }))
    );
    return issues;
  }
  const graph = document.ui.graph;
  if (Object.keys(graph.regionsById ?? {}).length > 0) {
    issues.push({
      code: CONTROLLED_REACT_JSX_ISSUE_CODES.shapeUnsupported,
      path: '/ui/graph/regionsById',
      message:
        'Controlled React/JSX currently supports ordinary element children only.',
    });
  }
  for (const [nodeId, node] of Object.entries(graph.nodesById).sort(
    ([left], [right]) => compareText(left, right)
  )) {
    const path = `/ui/graph/nodesById/${nodeId}`;
    if (node.kind !== 'element' && node.kind !== 'component-slot-outlet') {
      issues.push({
        code: CONTROLLED_REACT_JSX_ISSUE_CODES.shapeUnsupported,
        path,
        message: `Controlled React/JSX does not yet own ${node.kind} nodes.`,
        nodeId,
      });
      continue;
    }
    if (node.kind === 'component-slot-outlet') continue;
    if (!ELEMENT_TYPE_PATTERN.test(node.type)) {
      issues.push({
        code: CONTROLLED_REACT_JSX_ISSUE_CODES.nodeInvalid,
        path: `${path}/type`,
        message: `Element type "${node.type}" cannot be represented as a controlled JSX tag.`,
        nodeId,
      });
    }
    for (const [key, binding] of Object.entries(node.props ?? {})) {
      if (binding.kind === 'literal' && RESERVED_PROP_NAMES.has(key)) {
        issues.push({
          code: CONTROLLED_REACT_JSX_ISSUE_CODES.nodeInvalid,
          path: `${path}/props/${key}`,
          message: `Prop "${key}" is reserved by the controlled JSX protocol.`,
          nodeId,
        });
      }
    }
  }
  return issues;
};

const renderNode = (
  document: PIRDocument,
  node: PIRElementNode | PIRComponentSlotOutletNode,
  depth: number
): string => {
  const indent = '  '.repeat(depth);
  const attributeIndent = '  '.repeat(depth + 1);
  const props = node.kind === 'element' ? literalValues(node.props) : {};
  const childIds = document.ui.graph.childIdsById[node.id] ?? [];
  const literalText =
    node.kind === 'element' && node.text?.kind === 'literal'
      ? node.text
      : undefined;
  const attributes = [
    ...(Object.keys(props).length > 0
      ? [`${attributeIndent}{...${toStableJson(props)}}`]
      : []),
    ...(node.kind === 'component-slot-outlet'
      ? [
          `${attributeIndent}${CONTROLLED_REACT_JSX_SLOT_MEMBER_ATTRIBUTE}=${toStableJson(node.slotMemberId)}`,
        ]
      : []),
    `${attributeIndent}${CONTROLLED_REACT_JSX_NODE_ID_ATTRIBUTE}=${toStableJson(
      node.id
    )}`,
  ];
  const type = node.kind === 'element' ? node.type : 'slot';
  const opening = `${indent}<${type}\n${attributes.join('\n')}\n${indent}`;
  if (!literalText && childIds.length === 0) return `${opening}/>`;
  const content = [
    ...(literalText
      ? [`${'  '.repeat(depth + 1)}{${toStableJson(literalText.value)}}`]
      : []),
    ...childIds.map((childId) =>
      renderNode(
        document,
        document.ui.graph.nodesById[childId] as
          PIRElementNode | PIRComponentSlotOutletNode,
        depth + 1
      )
    ),
  ];
  return `${opening}>\n${content.join('\n')}\n${indent}</${type}>`;
};

/** Projects the explicitly supported PIR-current subset to canonical JSX. */
export const projectPirDocumentToControlledReactJsx = (
  document: PIRDocument
): ControlledReactJsxProjectionResult => {
  const issues = validateControlledDocument(document);
  if (issues.length > 0) return blocked(issues);
  const root = document.ui.graph.nodesById[document.ui.graph.rootId] as
    PIRElementNode | PIRComponentSlotOutletNode;
  return {
    status: 'ready',
    body: `export default (\n${renderNode(document, root, 1)}\n);`,
  };
};

type JsonExpressionResult =
  | Readonly<{ ok: true; value: PIRJsonValue }>
  | Readonly<{ ok: false; message: string }>;

const propertyNameText = (name: ts.PropertyName): string | undefined => {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }
  return undefined;
};

const readJsonExpression = (
  expression: ts.Expression
): JsonExpressionResult => {
  if (ts.isParenthesizedExpression(expression)) {
    return readJsonExpression(expression.expression);
  }
  if (ts.isStringLiteralLike(expression)) {
    return { ok: true, value: expression.text };
  }
  if (ts.isNumericLiteral(expression)) {
    const value = Number(expression.text);
    return Number.isFinite(value)
      ? { ok: true, value }
      : { ok: false, message: 'Numeric literals must be finite.' };
  }
  if (expression.kind === ts.SyntaxKind.TrueKeyword) {
    return { ok: true, value: true };
  }
  if (expression.kind === ts.SyntaxKind.FalseKeyword) {
    return { ok: true, value: false };
  }
  if (expression.kind === ts.SyntaxKind.NullKeyword) {
    return { ok: true, value: null };
  }
  if (
    ts.isPrefixUnaryExpression(expression) &&
    expression.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(expression.operand)
  ) {
    const value = -Number(expression.operand.text);
    return Number.isFinite(value)
      ? { ok: true, value }
      : { ok: false, message: 'Numeric literals must be finite.' };
  }
  if (ts.isArrayLiteralExpression(expression)) {
    const values: PIRJsonValue[] = [];
    for (const element of expression.elements) {
      if (ts.isSpreadElement(element) || ts.isOmittedExpression(element)) {
        return {
          ok: false,
          message: 'Array spreads and omitted entries are not controlled.',
        };
      }
      const value = readJsonExpression(element);
      if (!value.ok) return value;
      values.push(value.value);
    }
    return { ok: true, value: values };
  }
  if (ts.isObjectLiteralExpression(expression)) {
    const entries: Array<readonly [string, PIRJsonValue]> = [];
    const names = new Set<string>();
    for (const property of expression.properties) {
      if (!ts.isPropertyAssignment(property)) {
        return {
          ok: false,
          message:
            'Only explicit property assignments are controlled in object literals.',
        };
      }
      const name = propertyNameText(property.name);
      if (name === undefined || names.has(name)) {
        return {
          ok: false,
          message:
            name === undefined
              ? 'Computed object property names are not controlled.'
              : `Object property "${name}" is declared more than once.`,
        };
      }
      const value = readJsonExpression(property.initializer);
      if (!value.ok) return value;
      names.add(name);
      entries.push([name, value.value]);
    }
    return { ok: true, value: Object.fromEntries(entries) };
  }
  return {
    ok: false,
    message:
      'Controlled values must be JSON-compatible literals without calls, identifiers, or executable expressions.',
  };
};

const unwrapExpression = (expression: ts.Expression): ts.Expression =>
  ts.isParenthesizedExpression(expression)
    ? unwrapExpression(expression.expression)
    : expression;

type JsxElementLike = ts.JsxElement | ts.JsxSelfClosingElement;

const isJsxElementLike = (node: ts.Node): node is JsxElementLike =>
  ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node);

type ParsedGraph = {
  baseDocument: PIRDocument;
  nodesById: Record<string, PIRNode>;
  childIdsById: Record<string, readonly string[]>;
  issues: ControlledReactJsxIssue[];
};

const addProp = (
  props: Record<string, PIRJsonValue>,
  name: string,
  value: PIRJsonValue,
  path: string,
  issues: ControlledReactJsxIssue[]
): void => {
  if (RESERVED_PROP_NAMES.has(name)) {
    issues.push({
      code: CONTROLLED_REACT_JSX_ISSUE_CODES.nodeInvalid,
      path,
      message: `Prop "${name}" is reserved by the controlled JSX protocol.`,
    });
    return;
  }
  if (Object.hasOwn(props, name)) {
    issues.push({
      code: CONTROLLED_REACT_JSX_ISSUE_CODES.nodeInvalid,
      path,
      message: `Prop "${name}" is declared more than once.`,
    });
    return;
  }
  props[name] = value;
};

const readAttributeExpression = (
  attribute: ts.JsxAttribute
): JsonExpressionResult => {
  if (!attribute.initializer) return { ok: true, value: true };
  if (ts.isStringLiteral(attribute.initializer)) {
    return { ok: true, value: attribute.initializer.text };
  }
  if (
    !ts.isJsxExpression(attribute.initializer) ||
    !attribute.initializer.expression
  ) {
    return {
      ok: false,
      message: 'JSX attributes must use a literal initializer.',
    };
  }
  return readJsonExpression(attribute.initializer.expression);
};

const parseJsxElement = (
  element: JsxElementLike,
  sourceFile: ts.SourceFile,
  graph: ParsedGraph,
  path: string
): string | undefined => {
  const opening = ts.isJsxElement(element) ? element.openingElement : element;
  const type = opening.tagName.getText(sourceFile);
  if (!ELEMENT_TYPE_PATTERN.test(type)) {
    graph.issues.push({
      code: CONTROLLED_REACT_JSX_ISSUE_CODES.nodeInvalid,
      path: `${path}/type`,
      message: `JSX tag "${type}" is outside the controlled element subset.`,
    });
  }

  let nodeId: string | undefined;
  let slotMemberId: string | undefined;
  const props: Record<string, PIRJsonValue> = {};
  opening.attributes.properties.forEach((attribute, index) => {
    const attributePath = `${path}/attributes/${index}`;
    if (ts.isJsxSpreadAttribute(attribute)) {
      const value = readJsonExpression(attribute.expression);
      if (!value.ok || !isRecord(value.value)) {
        graph.issues.push({
          code: CONTROLLED_REACT_JSX_ISSUE_CODES.bindingUnsupported,
          path: attributePath,
          message: value.ok
            ? 'A controlled JSX spread must contain an object literal.'
            : value.message,
        });
        return;
      }
      Object.entries(value.value).forEach(([name, entry]) =>
        addProp(props, name, entry, attributePath, graph.issues)
      );
      return;
    }
    const name = attribute.name.getText(sourceFile);
    const value = readAttributeExpression(attribute);
    if (!value.ok) {
      graph.issues.push({
        code: CONTROLLED_REACT_JSX_ISSUE_CODES.bindingUnsupported,
        path: attributePath,
        message: value.message,
      });
      return;
    }
    if (name === CONTROLLED_REACT_JSX_NODE_ID_ATTRIBUTE) {
      if (typeof value.value !== 'string' || !value.value.trim() || nodeId) {
        graph.issues.push({
          code: CONTROLLED_REACT_JSX_ISSUE_CODES.nodeInvalid,
          path: attributePath,
          message:
            'Each controlled JSX element requires one non-empty data-prodivix-node-id string.',
        });
        return;
      }
      nodeId = value.value;
      return;
    }
    if (name === CONTROLLED_REACT_JSX_SLOT_MEMBER_ATTRIBUTE) {
      if (
        typeof value.value !== 'string' ||
        !value.value.trim() ||
        slotMemberId
      ) {
        graph.issues.push({
          code: CONTROLLED_REACT_JSX_ISSUE_CODES.nodeInvalid,
          path: attributePath,
          message:
            'A controlled Slot Outlet requires one non-empty slot member id.',
        });
        return;
      }
      slotMemberId = value.value;
      return;
    }
    if (name === 'style') {
      graph.issues.push({
        code: CONTROLLED_REACT_JSX_ISSUE_CODES.bindingUnsupported,
        path: attributePath,
        message:
          'Literal style is owned by the standalone controlled CSS region.',
      });
      return;
    }
    addProp(props, name, value.value, attributePath, graph.issues);
  });

  if (!nodeId) {
    graph.issues.push({
      code: CONTROLLED_REACT_JSX_ISSUE_CODES.nodeInvalid,
      path: `${path}/attributes`,
      message: 'Each controlled JSX element requires data-prodivix-node-id.',
    });
    return undefined;
  }
  if (graph.nodesById[nodeId]) {
    graph.issues.push({
      code: CONTROLLED_REACT_JSX_ISSUE_CODES.nodeInvalid,
      path: `${path}/attributes`,
      message: `Controlled node id "${nodeId}" appears more than once.`,
      nodeId,
    });
    return undefined;
  }
  const isSlotOutlet = type === 'slot' && slotMemberId !== undefined;
  if (slotMemberId !== undefined && type !== 'slot') {
    graph.issues.push({
      code: CONTROLLED_REACT_JSX_ISSUE_CODES.nodeInvalid,
      path: `${path}/type`,
      message:
        'The controlled Slot Outlet member attribute is valid only on a slot tag.',
      nodeId,
    });
  }

  let text: PIRJsonValue | undefined;
  let encounteredElement = false;
  const childIds: string[] = [];
  if (ts.isJsxElement(element)) {
    element.children.forEach((child, index) => {
      const childPath = `${path}/children/${index}`;
      if (isJsxElementLike(child)) {
        encounteredElement = true;
        const childId = parseJsxElement(child, sourceFile, graph, childPath);
        if (childId) childIds.push(childId);
        return;
      }
      if (ts.isJsxText(child) && child.text.trim().length === 0) return;
      if (encounteredElement || text !== undefined) {
        graph.issues.push({
          code: CONTROLLED_REACT_JSX_ISSUE_CODES.shapeUnsupported,
          path: childPath,
          message:
            'Controlled literal text must appear once before element children.',
          nodeId,
        });
        return;
      }
      if (ts.isJsxText(child)) {
        text = child.text.trim();
        return;
      }
      if (ts.isJsxExpression(child) && child.expression) {
        const value = readJsonExpression(child.expression);
        if (value.ok) text = value.value;
        else {
          graph.issues.push({
            code: CONTROLLED_REACT_JSX_ISSUE_CODES.bindingUnsupported,
            path: childPath,
            message: value.message,
            nodeId,
          });
        }
        return;
      }
      graph.issues.push({
        code: CONTROLLED_REACT_JSX_ISSUE_CODES.shapeUnsupported,
        path: childPath,
        message:
          'Fragments, comments, and executable child expressions are outside the controlled JSX subset.',
        nodeId,
      });
    });
  }

  const baseNode = graph.baseDocument.ui.graph.nodesById[nodeId];
  if (
    baseNode &&
    baseNode.kind !== (isSlotOutlet ? 'component-slot-outlet' : 'element')
  ) {
    graph.issues.push({
      code: CONTROLLED_REACT_JSX_ISSUE_CODES.nodeInvalid,
      path,
      message: `Node id "${nodeId}" cannot change its controlled PIR node kind.`,
      nodeId,
    });
    return undefined;
  }
  if (isSlotOutlet) {
    if (Object.keys(props).length > 0 || text !== undefined) {
      graph.issues.push({
        code: CONTROLLED_REACT_JSX_ISSUE_CODES.bindingUnsupported,
        path,
        message:
          'Controlled Slot Outlets expose only fallback element children; slot props stay in the PIR Contract binding.',
        nodeId,
      });
      return undefined;
    }
    const outlet: PIRComponentSlotOutletNode = {
      id: nodeId,
      kind: 'component-slot-outlet',
      slotMemberId: slotMemberId!,
      bindings:
        baseNode?.kind === 'component-slot-outlet'
          ? baseNode.bindings
          : { props: {} },
    };
    graph.nodesById[nodeId] = outlet;
    graph.childIdsById[nodeId] = childIds;
    return nodeId;
  }
  if (slotMemberId !== undefined) return undefined;
  const baseElement = baseNode?.kind === 'element' ? baseNode : undefined;
  const protectedProps = nonLiteralBindings(baseElement?.props);
  for (const name of Object.keys(props)) {
    if (!Object.hasOwn(protectedProps, name)) continue;
    graph.issues.push({
      code: CONTROLLED_REACT_JSX_ISSUE_CODES.bindingUnsupported,
      path: `${path}/props/${name}`,
      message: `Prop "${name}" is owned by a non-literal PIR binding.`,
      nodeId,
    });
  }
  if (
    baseElement?.text &&
    baseElement.text.kind !== 'literal' &&
    text !== undefined
  ) {
    graph.issues.push({
      code: CONTROLLED_REACT_JSX_ISSUE_CODES.bindingUnsupported,
      path: `${path}/text`,
      message: 'Text is owned by a non-literal PIR binding.',
      nodeId,
    });
  }
  const nextProps = { ...protectedProps, ...bindingRecord(props) };
  const node: PIRElementNode = {
    id: nodeId,
    kind: 'element',
    type,
    ...(Object.keys(nextProps).length > 0 ? { props: nextProps } : {}),
    ...(baseElement?.style ? { style: baseElement.style } : {}),
    ...(baseElement?.text && baseElement.text.kind !== 'literal'
      ? { text: baseElement.text }
      : text !== undefined
        ? { text: { kind: 'literal' as const, value: text } }
        : {}),
    ...(baseElement?.data ? { data: baseElement.data } : {}),
    ...(baseElement?.events ? { events: baseElement.events } : {}),
  };
  graph.nodesById[nodeId] = node;
  graph.childIdsById[nodeId] = childIds;
  return nodeId;
};

/** Parses controlled JSX into PIR-current and canonicalizes the managed body. */
export const parseControlledReactJsxToPirDocument = (input: {
  body: string;
  baseDocument: PIRDocument;
}): ControlledReactJsxParseResult => {
  const sourceFile = ts.createSourceFile(
    'controlled-view.tsx',
    input.body,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const parseDiagnostics = (
    sourceFile as ts.SourceFile & {
      readonly parseDiagnostics?: readonly ts.Diagnostic[];
    }
  ).parseDiagnostics;
  if (parseDiagnostics?.length) {
    return blocked(
      parseDiagnostics.map((diagnostic, index) => ({
        code: CONTROLLED_REACT_JSX_ISSUE_CODES.syntaxInvalid,
        path: `/syntax/${diagnostic.start ?? index}`,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      }))
    );
  }
  if (
    sourceFile.statements.length !== 1 ||
    !ts.isExportAssignment(sourceFile.statements[0]) ||
    sourceFile.statements[0].isExportEquals
  ) {
    return blocked([
      {
        code: CONTROLLED_REACT_JSX_ISSUE_CODES.shapeUnsupported,
        path: '/module',
        message:
          'A controlled JSX region must contain exactly one export default JSX tree.',
      },
    ]);
  }
  const rootExpression = unwrapExpression(sourceFile.statements[0].expression);
  if (!isJsxElementLike(rootExpression)) {
    return blocked([
      {
        code: CONTROLLED_REACT_JSX_ISSUE_CODES.shapeUnsupported,
        path: '/module/default',
        message: 'The controlled default export must be one JSX element.',
      },
    ]);
  }
  const graph: ParsedGraph = {
    baseDocument: input.baseDocument,
    nodesById: {},
    childIdsById: {},
    issues: [],
  };
  const rootId = parseJsxElement(
    rootExpression,
    sourceFile,
    graph,
    '/module/default'
  );
  if (!rootId || graph.issues.length > 0) return blocked(graph.issues);

  for (const [nodeId, node] of Object.entries(
    input.baseDocument.ui.graph.nodesById
  )) {
    if (graph.nodesById[nodeId]) continue;
    if (node.kind === 'component-slot-outlet') {
      graph.issues.push({
        code: CONTROLLED_REACT_JSX_ISSUE_CODES.bindingUnsupported,
        path: `/ui/graph/nodesById/${nodeId}`,
        message: `Slot Outlet "${nodeId}" cannot be deleted from controlled JSX while it owns Contract semantics.`,
        nodeId,
      });
      continue;
    }
    if (node.kind !== 'element') continue;
    const ownsNonControlledState =
      Boolean(node.data) ||
      Object.keys(node.events ?? {}).length > 0 ||
      Boolean(node.text && node.text.kind !== 'literal') ||
      Object.values(node.props ?? {}).some(
        (binding) => binding.kind !== 'literal'
      ) ||
      Object.values(node.style ?? {}).some(
        (binding) => binding.kind !== 'literal'
      );
    if (ownsNonControlledState) {
      graph.issues.push({
        code: CONTROLLED_REACT_JSX_ISSUE_CODES.bindingUnsupported,
        path: `/ui/graph/nodesById/${nodeId}`,
        message: `Node "${nodeId}" cannot be deleted from JSX while it owns non-controlled PIR state.`,
        nodeId,
      });
    }
  }
  if (graph.issues.length > 0) return blocked(graph.issues);

  const document: PIRDocument = {
    ...input.baseDocument,
    ui: {
      ...input.baseDocument.ui,
      graph: {
        rootId,
        nodesById: graph.nodesById,
        childIdsById: graph.childIdsById,
        order: { strategy: 'childIdsById' },
      },
    },
  };
  const issues = validateControlledDocument(document);
  if (issues.length > 0) return blocked(issues);
  const projection = projectPirDocumentToControlledReactJsx(document);
  if (projection.status === 'blocked') return projection;
  return { status: 'ready', document, body: projection.body };
};
