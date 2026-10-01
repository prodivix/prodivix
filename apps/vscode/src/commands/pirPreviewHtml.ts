import { readPirDocumentModel } from '../language/pirDocumentModel';
import { canonicalJsonText } from '@prodivix/shared/canonical';

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

/** Structural inspection never materializes bindings, invokes triggers, or runs user CodeSlot source. */
export const createPirPreviewHtml = (
  text: string,
  documentId: string,
  revision: number
): string => {
  const model = readPirDocumentModel(text, documentId, revision);
  const graph = model.document.ui.graph;
  const pending = [{ id: graph.rootId, depth: 0, region: 'root' }];
  const seen = new Set<string>();
  const rows: string[] = [];
  while (pending.length > 0) {
    if (rows.length >= 5_000)
      throw new Error('PIR structure preview is limited to 5,000 nodes.');
    const current = pending.pop()!;
    if (seen.has(current.id)) continue;
    seen.add(current.id);
    const node = graph.nodesById[current.id];
    const label =
      node.kind === 'element'
        ? node.type
        : node.kind === 'component-instance'
          ? `component → ${node.componentDocumentId}`
          : node.kind === 'component-slot-outlet'
            ? `slot → ${node.slotMemberId}`
            : 'collection';
    const literalText =
      node.kind === 'element' && node.text?.kind === 'literal'
        ? JSON.stringify(node.text.value)
        : '';
    rows.push(
      `<li><span>${escapeHtml('  '.repeat(Math.min(current.depth, 64)) + current.region + ' · ' + node.id)}</span><strong>${escapeHtml(label)}</strong><code>${escapeHtml(literalText)}</code><details><summary>Typed bindings</summary><pre>${escapeHtml(canonicalJsonText(node))}</pre></details></li>`
    );
    const children = [
      ...(graph.childIdsById[node.id] ?? []).map((id) => ({
        id,
        region: 'child',
      })),
      ...Object.entries(graph.regionsById?.[node.id] ?? {}).flatMap(
        ([region, ids]) => ids.map((id) => ({ id, region }))
      ),
    ];
    for (const child of children.reverse())
      pending.push({ ...child, depth: current.depth + 1 });
  }
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>PIR structure preview</title><style>body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:24px}li{display:flex;gap:16px;padding:8px;border-bottom:1px solid var(--vscode-panel-border)}span{white-space:pre}code{white-space:pre-wrap;overflow-wrap:anywhere}ul{padding:0}strong{min-width:120px}</style></head><body><h1>PIR structure preview</h1><p>${escapeHtml(documentId)} · editor revision ${revision}</p><p>Read-only typed structure. Bindings and triggers are not executed. Component dependencies require the Workspace host.</p><ul>${rows.join('')}</ul><h2>Typed symbols</h2><ul>${model.symbols.map((symbol) => `<li>${escapeHtml(symbol.name)} · ${escapeHtml(symbol.kind)}${symbol.typeRef ? ' · ' + escapeHtml(symbol.typeRef) : ''}</li>`).join('')}</ul></body></html>`;
};
