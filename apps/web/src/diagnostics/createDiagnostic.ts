import type {
  CreateDiagnosticInput,
  ProdivixDiagnostic,
} from './diagnostic.types';

export const createDiagnostic = (
  diagnostic: CreateDiagnosticInput
): ProdivixDiagnostic => ({
  retryable: false,
  ...diagnostic,
});
