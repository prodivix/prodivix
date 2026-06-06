import type { CanonicalNode } from './canonicalIR';
import type { CompileDiagnostic } from './diagnostics';

export type AdapterImportKind = 'default' | 'named' | 'namespace';

export interface AdapterImportSpec {
  source: string;
  kind: AdapterImportKind;
  imported: string;
  local?: string;
}

export interface AdapterResolution {
  element: string;
  imports?: AdapterImportSpec[];
  diagnostics?: CompileDiagnostic[];
}

export interface TargetAdapter {
  id: string;
  resolveNode: (node: CanonicalNode) => AdapterResolution;
}
