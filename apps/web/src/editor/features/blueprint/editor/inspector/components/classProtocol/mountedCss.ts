import type { ComponentNode } from '@prodivix/shared/types/pir';
import type { CodeSlotBinding } from '@/authoring';
import type { WorkspaceDocumentRecord } from '@/editor/editorApi';
import { isWorkspaceCodeDocumentContent } from '@/workspace';

export type MountedCssEntry = {
  id: string;
  path: string;
  content?: string;
  classes: string[];
  classIndex: Record<string, { line?: number; column?: number }>;
  binding?: CodeSlotBinding;
};

type UnsafeRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnsafeRecord | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnsafeRecord)
    : undefined;

const readClassIndex = (
  value: unknown
): Record<string, { line?: number; column?: number }> => {
  if (!asRecord(value)) return {};
  const result: Record<string, { line?: number; column?: number }> = {};
  Object.entries(value).forEach(([className, meta]) => {
    if (!className) return;
    const detail = asRecord(meta);
    if (!detail) {
      result[className] = {};
      return;
    }
    const line =
      typeof detail.line === 'number' && Number.isFinite(detail.line)
        ? detail.line
        : undefined;
    const column =
      typeof detail.column === 'number' && Number.isFinite(detail.column)
        ? detail.column
        : undefined;
    result[className] = { line, column };
  });
  return result;
};

const parseMountedCssEntry = (raw: unknown, fallbackId: string) => {
  const record = asRecord(raw);
  if (!record) return null;
  const path = typeof record.path === 'string' ? record.path.trim() : '';
  if (!path) return null;
  const classes = Array.isArray(record.classes)
    ? record.classes
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const content =
    typeof record.content === 'string' ? record.content : undefined;
  const classIndex = readClassIndex(record.classIndex);
  const mergedClasses = new Set<string>([
    ...classes,
    ...Object.keys(classIndex),
  ]);
  return {
    id:
      typeof record.id === 'string' && record.id.trim()
        ? record.id.trim()
        : fallbackId,
    path,
    content,
    classes: [...mergedClasses],
    classIndex,
  } satisfies MountedCssEntry;
};

const readMountCandidates = (node: ComponentNode): unknown[] => {
  const anyNode = node as ComponentNode & { metadata?: unknown };
  const props = asRecord(anyNode.props);
  const metadata = asRecord(anyNode.metadata);

  const candidates: unknown[] = [];
  [
    props?.mountedCss,
    props?.styleMount,
    props?.styleMountCss,
    metadata?.mountedCss,
    metadata?.styleMount,
  ].forEach((candidate) => {
    if (candidate !== undefined) candidates.push(candidate);
  });
  return candidates;
};

export const createMountedCssSlotId = (nodeId: string) =>
  `blueprint.node.${nodeId}.mountedCss`;

export const createMountedCssDocumentId = (nodeId: string) =>
  `code_mounted_css_${nodeId.replace(/[^a-zA-Z0-9_-]+/g, '_')}`;

export const createMountedCssNodeId = (nodeId: string) =>
  `node_${createMountedCssDocumentId(nodeId)}`;

export const createMountedCssPath = (nodeId: string) =>
  `/styles/mounted/${nodeId}.css`;

const readCodeBindings = (node: ComponentNode): Record<string, unknown> => {
  const props = asRecord(node.props);
  return asRecord(props?.codeBindings) ?? {};
};

export const resolveMountedCssBindings = (
  node: ComponentNode
): CodeSlotBinding[] => {
  const bindings = readCodeBindings(node);
  const mountedCss = bindings.mountedCss;
  const candidates = Array.isArray(mountedCss) ? mountedCss : [mountedCss];
  return candidates
    .map((candidate): CodeSlotBinding | null => {
      const record = asRecord(candidate);
      const reference = asRecord(record?.reference);
      if (
        typeof record?.slotId !== 'string' ||
        !record.slotId.trim() ||
        typeof reference?.artifactId !== 'string' ||
        !reference.artifactId.trim()
      ) {
        return null;
      }
      return {
        slotId: record.slotId.trim(),
        reference: {
          artifactId: reference.artifactId.trim(),
          ...(typeof reference.exportName === 'string' &&
          reference.exportName.trim()
            ? { exportName: reference.exportName.trim() }
            : {}),
          ...(typeof reference.symbolName === 'string' &&
          reference.symbolName.trim()
            ? { symbolName: reference.symbolName.trim() }
            : {}),
        },
      };
    })
    .filter((binding): binding is CodeSlotBinding => Boolean(binding));
};

export const upsertMountedCssBinding = (
  node: ComponentNode,
  binding: CodeSlotBinding
): ComponentNode => {
  const props = asRecord(node.props) ?? {};
  const codeBindings = readCodeBindings(node);
  const currentBindings = resolveMountedCssBindings(node);
  const nextMountedCssBindings = currentBindings.some(
    (item) => item.slotId === binding.slotId
  )
    ? currentBindings.map((item) =>
        item.slotId === binding.slotId ? binding : item
      )
    : [...currentBindings, binding];
  return {
    ...node,
    props: {
      ...props,
      codeBindings: {
        ...codeBindings,
        mountedCss: nextMountedCssBindings,
      },
    },
  };
};

export const resolveMountedCssEntriesFromWorkspace = (
  node: ComponentNode,
  documentsById: Record<string, WorkspaceDocumentRecord>
): MountedCssEntry[] => {
  const entries = resolveMountedCssBindings(node)
    .map((binding) => {
      const document = documentsById[binding.reference.artifactId];
      if (
        !document ||
        document.type !== 'code' ||
        !isWorkspaceCodeDocumentContent(document.content) ||
        document.content.language !== 'css'
      ) {
        return null;
      }
      const content = document.content.source;
      const classIndex = extractCssClassIndexFromContent(content);
      return {
        id: document.id,
        path: document.path,
        content,
        classes: [...new Set(Object.keys(classIndex))],
        classIndex,
        binding,
      } satisfies MountedCssEntry;
    })
    .filter(Boolean);
  return entries as MountedCssEntry[];
};

export const resolveMountedCssEntries = (
  node: ComponentNode,
  documentsById: Record<string, WorkspaceDocumentRecord> = {}
): MountedCssEntry[] => {
  const entries: MountedCssEntry[] = resolveMountedCssEntriesFromWorkspace(
    node,
    documentsById
  );
  readMountCandidates(node).forEach((candidate, index) => {
    if (Array.isArray(candidate)) {
      candidate.forEach((item, itemIndex) => {
        const parsed = parseMountedCssEntry(
          item,
          `mounted-${index + 1}-${itemIndex + 1}`
        );
        if (parsed) entries.push(parsed);
      });
      return;
    }
    const parsed = parseMountedCssEntry(candidate, `mounted-${index + 1}`);
    if (parsed) entries.push(parsed);
  });
  return entries;
};

export const resolveMountedCssTokenTarget = (
  entries: MountedCssEntry[],
  token: string
): (MountedCssEntry & { line?: number; column?: number }) | null => {
  for (const entry of entries) {
    if (!entry.classes.includes(token)) continue;
    const position = entry.classIndex[token];
    return { ...entry, line: position?.line, column: position?.column };
  }
  return null;
};

export const extractCssClassIndexFromContent = (content: string) => {
  const index: Record<string, { line?: number; column?: number }> = {};
  const matcher = /\.([_a-zA-Z][_a-zA-Z0-9-]*)/g;
  let match: RegExpExecArray | null = matcher.exec(content);
  while (match) {
    const className = match[1];
    const rawIndex = match.index;
    const before = content.slice(0, rawIndex);
    const lines = before.split('\n');
    index[className] = {
      line: lines.length,
      column: (lines.at(-1)?.length ?? 0) + 1,
    };
    match = matcher.exec(content);
  }
  return index;
};

export const mergeMountedCssEntryWithContent = (
  entry: MountedCssEntry,
  content: string
): MountedCssEntry => {
  const classIndex = extractCssClassIndexFromContent(content);
  return {
    ...entry,
    content,
    classIndex,
    classes: [...new Set(Object.keys(classIndex))],
  };
};
