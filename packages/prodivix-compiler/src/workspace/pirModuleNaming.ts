import type { WorkspacePirDocument } from '@prodivix/workspace';

const toPascalIdentifier = (value: string, fallback: string): string => {
  const candidate = value
    .trim()
    .replace(/\.[^.]+$/, '')
    .split(/[^a-zA-Z0-9_$]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  const normalized = candidate || fallback;
  return /^[a-zA-Z_$]/.test(normalized) ? normalized : `_${normalized}`;
};

const displayNameOf = (document: WorkspacePirDocument): string =>
  document.content.metadata?.name ??
  document.name ??
  document.path.split('/').at(-1) ??
  document.id;

export const createPirReactModuleId = (documentId: string): string =>
  `pir-react:${documentId}`;

export const createPirReactModuleNames = (
  documentIds: readonly string[],
  documentsById: Readonly<Record<string, WorkspacePirDocument>>
): Readonly<Record<string, string>> => {
  const result: Record<string, string> = {};
  const used = new Set<string>();
  for (const documentId of documentIds) {
    const document = documentsById[documentId];
    if (!document) continue;
    const base = toPascalIdentifier(displayNameOf(document), 'PdxComponent');
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${base}${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    result[documentId] = candidate;
  }
  return Object.freeze(result);
};
