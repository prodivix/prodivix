import { sameCanonicalJson } from '@prodivix/shared/canonical';
import type { WorkspaceDiagnosticProjectionReceipt } from './workspaceDiagnosticProjection.types';

export const assertWorkspaceDiagnosticProjectionReceiptMatches = (
  receipt: WorkspaceDiagnosticProjectionReceipt,
  expected: WorkspaceDiagnosticProjectionReceipt
): void => {
  if (!sameCanonicalJson(receipt, expected)) {
    throw new TypeError(
      'Workspace diagnostic receipt does not match its canonical owner inputs.'
    );
  }
};
