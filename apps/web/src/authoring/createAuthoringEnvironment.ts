import {
  createCodeArtifactProviderRegistry,
  type CodeArtifactProviderRegistry,
} from '@/authoring/codeArtifactProviderRegistry';
import {
  createCodeSymbolProviderRegistry,
  type CodeSymbolProviderRegistry,
} from '@/authoring/codeSymbolProviderRegistry';
import {
  createAuthoringDiagnosticProviderRegistry,
  type AuthoringDiagnosticProviderRegistry,
} from '@/authoring/authoringDiagnosticProviderRegistry';
import type {
  AuthoringEnvironment,
  CodeCompletion,
} from '@/authoring/authoring.types';

export type CreateAuthoringEnvironmentInput = {
  revision: string;
  artifactRegistry?: CodeArtifactProviderRegistry;
  symbolRegistry?: CodeSymbolProviderRegistry;
  diagnosticRegistry?: AuthoringDiagnosticProviderRegistry;
};

export const createAuthoringEnvironment = ({
  revision,
  artifactRegistry = createCodeArtifactProviderRegistry(),
  symbolRegistry = createCodeSymbolProviderRegistry(),
  diagnosticRegistry = createAuthoringDiagnosticProviderRegistry(),
}: CreateAuthoringEnvironmentInput): AuthoringEnvironment => ({
  revision,
  listArtifacts: (context) => artifactRegistry.listArtifacts(context),
  querySymbols: (context) => symbolRegistry.listSymbols(context),
  resolveReference: () => null,
  getCompletions: (context): CodeCompletion[] =>
    symbolRegistry.listSymbols(context).map((symbol) => ({
      label: symbol.name,
      symbolId: symbol.id,
      detail: symbol.typeRef,
    })),
  getDiagnostics: (context) => diagnosticRegistry.getDiagnostics(context),
  getDefinition: () => null,
  getReferences: () => [],
});
