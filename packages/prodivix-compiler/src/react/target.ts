import { reactAdapter } from '#src/react/adapter';
import { reactDocumentShellEmitter } from '#src/react/documentShellEmitter';
import { reactElementEmitter } from '#src/react/elementEmitter';
import { createPirReactModuleId } from '#src/react/moduleNaming';
import type { PirCompileTarget } from '#src/workspace/pirTarget';

export const reactCompileTarget: PirCompileTarget = {
  label: 'React',
  adapter: reactAdapter,
  elementEmitter: reactElementEmitter,
  shell: reactDocumentShellEmitter,
  createModuleId: createPirReactModuleId,
};
