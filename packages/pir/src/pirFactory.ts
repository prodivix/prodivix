import type { PIRComponentContract, PIRDocument } from './pir.types';

export const createEmptyPirComponentContract = (): PIRComponentContract => ({
  propsById: {},
  eventsById: {},
  slotsById: {},
  variantAxesById: {},
});

export type CreateEmptyPIRDocumentOptions = Readonly<{
  rootId?: string;
  rootType?: string;
  componentContract?: PIRComponentContract;
}>;

export const createEmptyPirDocument = (
  options: CreateEmptyPIRDocumentOptions = {}
): PIRDocument => {
  const rootId = options.rootId?.trim() || 'root';
  const rootType = options.rootType?.trim() || 'container';
  return {
    ...(options.componentContract
      ? { componentContract: options.componentContract }
      : {}),
    ui: {
      graph: {
        rootId,
        nodesById: {
          [rootId]: {
            id: rootId,
            kind: 'element',
            type: rootType,
          },
        },
        childIdsById: { [rootId]: [] },
        order: { strategy: 'childIdsById' },
      },
    },
  };
};
