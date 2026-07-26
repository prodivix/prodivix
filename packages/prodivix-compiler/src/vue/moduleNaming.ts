import { createPirModuleId } from '#src/workspace/pirModuleNaming';

/** Vue module ids keep their own namespace; the topology is shared. */
export const createPirVueModuleId = (documentId: string): string =>
  createPirModuleId('pir-vue', documentId);
