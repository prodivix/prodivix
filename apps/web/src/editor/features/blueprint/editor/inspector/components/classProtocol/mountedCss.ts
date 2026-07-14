import type { CodeSlotBinding } from '@prodivix/authoring';
import { createPirMountedCssCodeSlotId } from '@prodivix/pir';
import {
  isWorkspaceCodeDocumentContent,
  type WorkspaceDocument,
} from '@prodivix/workspace';
import type { BlueprintInspectorNodeView } from '../../projection';

export type MountedCssEntry = {
  id: string;
  path: string;
  content?: string;
  classes: string[];
  classIndex: Record<string, { line?: number; column?: number }>;
  binding?: CodeSlotBinding;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

export const createMountedCssPath = (nodeId: string) =>
  `/styles/mounted/${nodeId}.css`;

/** Reads only the canonical CodeReference binding exposed by PIR-current. */
export const resolveMountedCssBindings = (
  node: BlueprintInspectorNodeView,
  documentId: string
): CodeSlotBinding[] => {
  const binding = asRecord(node.props?.mountedCss);
  const reference = asRecord(binding?.reference);
  if (
    binding?.kind !== 'code' ||
    typeof reference?.artifactId !== 'string' ||
    !reference.artifactId.trim()
  ) {
    return [];
  }
  return [
    {
      slotId: createPirMountedCssCodeSlotId(documentId, node.id),
      reference: {
        artifactId: reference.artifactId.trim(),
        ...(typeof reference.exportName === 'string' &&
        reference.exportName.trim()
          ? { exportName: reference.exportName.trim() }
          : {}),
        ...(typeof reference.symbolId === 'string' && reference.symbolId.trim()
          ? { symbolId: reference.symbolId.trim() }
          : {}),
      },
    },
  ];
};

export const resolveMountedCssEntries = (
  node: BlueprintInspectorNodeView,
  documentId: string,
  documentsById: Record<string, WorkspaceDocument> = {}
): MountedCssEntry[] =>
  resolveMountedCssBindings(node, documentId).flatMap(
    (binding): MountedCssEntry[] => {
      const document = documentsById[binding.reference.artifactId];
      if (
        !document ||
        document.type !== 'code' ||
        !isWorkspaceCodeDocumentContent(document.content) ||
        document.content.language !== 'css'
      ) {
        return [];
      }
      const content = document.content.source;
      const classIndex = extractCssClassIndexFromContent(content);
      return [
        {
          id: document.id,
          path: document.path,
          content,
          classes: [...new Set(Object.keys(classIndex))],
          classIndex,
          binding,
        } satisfies MountedCssEntry,
      ];
    }
  );

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
    const before = content.slice(0, match.index);
    const lines = before.split('\n');
    index[className] = {
      line: lines.length,
      column: (lines.at(-1)?.length ?? 0) + 1,
    };
    match = matcher.exec(content);
  }
  return index;
};
