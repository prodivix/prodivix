import { vueAdapter } from '#src/vue/adapter';
import { vueDocumentShellEmitter } from '#src/vue/documentShellEmitter';
import { vueElementEmitter } from '#src/vue/elementEmitter';
import { createPirVueModuleId } from '#src/vue/moduleNaming';
import type { PirCompileTarget } from '#src/workspace/pirTarget';

export const vueCompileTarget: PirCompileTarget = {
  label: 'Vue',
  adapter: vueAdapter,
  elementEmitter: vueElementEmitter,
  shell: vueDocumentShellEmitter,
  createModuleId: createPirVueModuleId,
};
