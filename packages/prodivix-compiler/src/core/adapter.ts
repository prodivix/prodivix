import type { CompileDiagnostic } from '#src/core/diagnostics';

/** Stable, schema-neutral node view exposed to target adapters. */
export type TargetAdapterNode = Readonly<{
  id: string;
  type: string;
  path: string;
  text?: unknown;
  style: Readonly<Record<string, unknown>>;
  props: Readonly<Record<string, unknown>>;
  events: Readonly<Record<string, unknown>>;
  children: readonly TargetAdapterNode[];
}>;

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
  props?: Record<string, unknown>;
  style?: Record<string, unknown>;
  textMode?: 'preserve' | 'omit';
  childrenMode?: 'preserve' | 'omit';
}

export interface TargetAdapter {
  id: string;
  resolveNode: (node: TargetAdapterNode) => AdapterResolution;
}
