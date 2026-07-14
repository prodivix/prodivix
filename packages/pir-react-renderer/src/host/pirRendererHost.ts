import type {
  PIRNode,
  PIRTriggerBinding,
  PIRValueBinding,
} from '@prodivix/pir';
import type { WorkspacePirProjectionPlan } from '@prodivix/workspace';
import {
  PIR_RENDERER_BLOCKING_ISSUE_CODES,
  type PIRElementHostEntry,
  type PIRRendererBlockingIssue,
  type PIRRendererHost,
  type PIRRendererHostResolution,
} from '../PIRRenderer.types';

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const escapePointerToken = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const nodePath = (documentId: string, nodeId: string): string =>
  `/documentsById/${escapePointerToken(documentId)}/content/ui/graph/nodesById/${escapePointerToken(nodeId)}`;

const collectTriggerValueBindings = (
  trigger: PIRTriggerBinding,
  path: string,
  visit: (binding: PIRValueBinding, path: string) => void
): void => {
  if (trigger.kind === 'emit-component-event' && trigger.payload) {
    visit(trigger.payload, `${path}/payload`);
  }
};

const collectNodeValueBindings = (
  node: PIRNode,
  basePath: string,
  visit: (binding: PIRValueBinding, path: string) => void
): void => {
  if (node.kind === 'element') {
    if (node.text) visit(node.text, `${basePath}/text`);
    for (const [name, binding] of Object.entries(node.style ?? {})) {
      visit(binding, `${basePath}/style/${escapePointerToken(name)}`);
    }
    for (const [name, binding] of Object.entries(node.props ?? {})) {
      visit(binding, `${basePath}/props/${escapePointerToken(name)}`);
    }
    for (const [field, binding] of [
      ['source', node.data?.source],
      ['value', node.data?.value],
      ['mock', node.data?.mock],
    ] as const) {
      if (binding) visit(binding, `${basePath}/data/${field}`);
    }
    for (const [name, binding] of Object.entries(node.data?.extend ?? {})) {
      visit(binding, `${basePath}/data/extend/${escapePointerToken(name)}`);
    }
    for (const [name, trigger] of Object.entries(node.events ?? {})) {
      collectTriggerValueBindings(
        trigger,
        `${basePath}/events/${escapePointerToken(name)}`,
        visit
      );
    }
    return;
  }
  if (node.kind === 'component-instance') {
    for (const [memberId, binding] of Object.entries(node.bindings.props)) {
      visit(
        binding,
        `${basePath}/bindings/props/${escapePointerToken(memberId)}`
      );
    }
    for (const [memberId, trigger] of Object.entries(node.bindings.events)) {
      collectTriggerValueBindings(
        trigger,
        `${basePath}/bindings/events/${escapePointerToken(memberId)}`,
        visit
      );
    }
    return;
  }
  if (node.kind === 'component-slot-outlet') {
    for (const [memberId, binding] of Object.entries(node.bindings.props)) {
      visit(
        binding,
        `${basePath}/bindings/props/${escapePointerToken(memberId)}`
      );
    }
    return;
  }
  if (node.source.kind === 'binding') {
    visit(node.source.value, `${basePath}/source/value`);
  }
  if (node.key.kind === 'binding') {
    visit(node.key.value, `${basePath}/key/value`);
  }
};

const compareIssues = (
  left: PIRRendererBlockingIssue,
  right: PIRRendererBlockingIssue
): number =>
  compareText(left.path, right.path) ||
  compareText(left.instancePath ?? '', right.instancePath ?? '') ||
  compareText(left.code, right.code) ||
  compareText(left.message, right.message);

/** Resolves every Element through an explicit host before React runs. */
export const resolvePirRendererHost = (
  plan: WorkspacePirProjectionPlan,
  host: PIRRendererHost
): PIRRendererHostResolution => {
  const elementsByType: Record<string, PIRElementHostEntry> = {};
  const missingElementTypes = new Set<string>();
  const issues: PIRRendererBlockingIssue[] = [];

  for (const documentId of Object.keys(plan.documentsById).sort(compareText)) {
    const document = plan.documentsById[documentId]!;
    for (const [nodeId, node] of Object.entries(
      document.content.ui.graph.nodesById
    ).sort(([left], [right]) => compareText(left, right))) {
      const basePath = nodePath(documentId, nodeId);
      if (node.kind === 'element') {
        let resolved: PIRElementHostEntry | undefined =
          elementsByType[node.type];
        if (!resolved && !missingElementTypes.has(node.type)) {
          resolved = host.resolveElement(node.type);
          if (resolved) elementsByType[node.type] = resolved;
          else missingElementTypes.add(node.type);
        }
        if (!resolved) {
          issues.push({
            code: PIR_RENDERER_BLOCKING_ISSUE_CODES.elementResolverMissing,
            path: `${basePath}/type`,
            message: `No PIR Element host is registered for "${node.type}".`,
            documentId,
            nodeId,
            elementType: node.type,
          });
        }
      }

      collectNodeValueBindings(node, basePath, (binding, path) => {
        if (binding.kind !== 'code' || host.resolveCodeValue) return;
        issues.push({
          code: PIR_RENDERER_BLOCKING_ISSUE_CODES.codeResolverMissing,
          path,
          message: `Code-backed value "${binding.reference.artifactId}" requires an explicit Renderer code resolver.`,
          documentId,
          nodeId,
        });
      });
    }
  }

  if (issues.length > 0) {
    return Object.freeze({
      status: 'blocked' as const,
      issues: Object.freeze(
        issues.sort(compareIssues).map((issue) => Object.freeze(issue))
      ),
    });
  }
  return Object.freeze({
    status: 'ready' as const,
    host: Object.freeze({
      elementsByType: Object.freeze(elementsByType),
      ...(host.resolveCodeValue
        ? { resolveCodeValue: host.resolveCodeValue }
        : {}),
    }),
  });
};
