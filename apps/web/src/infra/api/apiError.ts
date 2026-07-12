import type {
  ProdivixDiagnostic,
  ProdivixDiagnosticDomain,
  ProdivixDiagnosticSeverity,
} from '@prodivix/diagnostics';

export type ApiErrorDiagnosticPayload = {
  code: string;
  message: string;
  severity?: ProdivixDiagnosticSeverity;
  domain?: ProdivixDiagnosticDomain | string;
  retryable?: boolean;
  path?: string;
  targetRef?: unknown;
  docsUrl?: string;
  details?: unknown;
};

export type ApiErrorEnvelopePayload = {
  code: string;
  message: string;
  severity?: ProdivixDiagnosticSeverity;
  domain?: ProdivixDiagnosticDomain | string;
  retryable?: boolean;
  requestId?: string;
  docsUrl?: string;
  details?: unknown;
  diagnostics?: ApiErrorDiagnosticPayload[];
};

export type ApiErrorPayload = {
  error?: ApiErrorEnvelopePayload;
};

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  payload?: ApiErrorPayload;
  requestId?: string;
  retryable?: boolean;
  diagnostics: ProdivixDiagnostic[];

  constructor(
    message: string,
    status: number,
    code: string,
    details?: unknown,
    options: {
      requestId?: string;
      retryable?: boolean;
      diagnostics?: ProdivixDiagnostic[];
      payload?: ApiErrorPayload;
    } = {}
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.payload = options.payload;
    this.requestId = options.requestId;
    this.retryable = options.retryable;
    this.diagnostics = options.diagnostics ?? [];
  }
}
