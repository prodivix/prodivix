import type { TargetAdapter } from '#src/core/adapter';
import type { PirDocumentShellEmitter } from '#src/workspace/pirDocumentShellEmitter';
import type { PirElementEmitter } from '#src/workspace/pirElementEmitter';

/**
 * Everything a framework target contributes to PIR compilation.
 *
 * Four values. Anything a target needs beyond these would be a second copy of
 * the domain compiler, which ADR 31:344 forbids.
 */
export type PirCompileTarget = Readonly<{
  label: string;
  adapter: TargetAdapter;
  elementEmitter: PirElementEmitter;
  shell: PirDocumentShellEmitter;
  createModuleId(documentId: string): string;
}>;
