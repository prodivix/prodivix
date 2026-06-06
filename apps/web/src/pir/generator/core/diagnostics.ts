export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export type DiagnosticSource = 'canonical-ir' | 'adapter' | 'codegen';

export interface CompileDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  source: DiagnosticSource;
  message: string;
  path: string;
  suggestion?: string;
}

export interface DiagnosticBag {
  diagnostics: CompileDiagnostic[];
  push: (diagnostic: CompileDiagnostic) => void;
}

export const createDiagnosticBag = (): DiagnosticBag => {
  const diagnostics: CompileDiagnostic[] = [];
  return {
    diagnostics,
    push: (diagnostic) => diagnostics.push(diagnostic),
  };
};
