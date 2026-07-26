import { createPirModuleId } from '#src/workspace/pirModuleNaming';

/** React module ids keep their own namespace; the topology is shared. */
export const createPirReactModuleId = (documentId: string): string =>
  createPirModuleId('pir-react', documentId);
