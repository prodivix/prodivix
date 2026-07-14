import type { ExportSourceTrace } from '#src/export/types';

const escapeJsonPointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

export const toPirNodePath = (nodeId: string): string =>
  `/ui/graph/nodesById/${escapeJsonPointerSegment(nodeId)}`;

export const toPirContractMemberPath = (
  collection: 'propsById' | 'eventsById' | 'slotsById' | 'variantAxesById',
  memberId: string
): string =>
  `/componentContract/${collection}/${escapeJsonPointerSegment(memberId)}`;

export const toPirInstanceRegionPath = (
  instanceNodeId: string,
  slotMemberId: string
): string =>
  `/ui/graph/regionsById/${escapeJsonPointerSegment(instanceNodeId)}/${escapeJsonPointerSegment(slotMemberId)}`;

export const toPirCollectionRegionPath = (
  collectionNodeId: string,
  regionName: 'item' | 'empty' | 'loading' | 'error'
): string =>
  `/ui/graph/regionsById/${escapeJsonPointerSegment(collectionNodeId)}/${regionName}`;

export const toPirCollectionSymbolPath = (
  collectionNodeId: string,
  symbol: 'itemId' | 'indexId' | 'errorId'
): string => `${toPirNodePath(collectionNodeId)}/symbols/${symbol}`;

export class PIRReactSourceTraceCollector {
  private readonly traces = new Map<string, ExportSourceTrace>();

  constructor(
    private readonly documentId: string,
    private readonly moduleId: string,
    documentPath: string
  ) {
    this.add('workspace-document', documentId, documentPath);
  }

  add(domain: string, id: string, path?: string): void {
    const trace: ExportSourceTrace = {
      sourceRef: {
        domain,
        id,
        ...(path ? { path } : {}),
      },
      artifactId: this.moduleId,
      ownerRootId: this.documentId,
    };
    const key = `${domain}\u0000${id}\u0000${path ?? ''}\u0000${this.moduleId}`;
    this.traces.set(key, trace);
  }

  addPir(path: string, sourceDocumentId = this.documentId): void {
    this.add('pir', sourceDocumentId, path);
  }

  values(): ExportSourceTrace[] {
    return [...this.traces.entries()]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([, trace]) => trace);
  }
}
