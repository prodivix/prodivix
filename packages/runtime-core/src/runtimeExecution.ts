export type RuntimeStatePatch = Record<string, unknown>;

export type RuntimeExecutionSource = {
  ownerId: string;
  trigger: string;
  eventKey: string;
};

export type RuntimeExecutionRequest<
  TParams extends Record<string, unknown> = Record<string, unknown>,
> = {
  requestId: string;
  source: RuntimeExecutionSource;
  params?: TParams;
  input?: unknown;
};

export type RuntimeCancellationSignal = {
  readonly aborted: boolean;
  readonly reason?: unknown;
};

export type RuntimeTraceEvent<
  TKind extends string = string,
  TDetail extends Record<string, unknown> = Record<string, unknown>,
> = {
  sequence: number;
  kind: TKind;
  detail: TDetail;
};

export const mergeRuntimeStatePatch = (
  current: RuntimeStatePatch,
  next: RuntimeStatePatch | undefined
): RuntimeStatePatch =>
  next && Object.keys(next).length ? { ...current, ...next } : current;
