import type { CodeReference } from '@prodivix/authoring';
import type {
  ExecutionEnvironmentResolutionLease,
  ExecutionValue,
  RuntimeZone,
  SecretRef,
} from '@prodivix/runtime-core';

export const SERVER_FUNCTION_KINDS = Object.freeze([
  'function',
  'route-loader',
  'route-action',
  'route-guard',
] as const);

export type ServerFunctionKind = (typeof SERVER_FUNCTION_KINDS)[number];

export const SERVER_FUNCTION_EFFECTS = Object.freeze([
  'read',
  'mutation',
] as const);

export type ServerFunctionEffect = (typeof SERVER_FUNCTION_EFFECTS)[number];

export const SERVER_FUNCTION_MAX_ATTEMPTS = 10;

export type ServerRuntimeJsonSchema =
  boolean | Readonly<Record<string, ExecutionValue>>;

export type AuthPrincipal = Readonly<{
  providerId: string;
  principalId: string;
}>;

/** Server-owned identity only. It must never cross the preview frame bridge. */
export type AuthSessionReference = Readonly<{
  providerId: string;
  sessionId: string;
  principalId: string;
  expiresAt: string;
}>;

export type ServerFunctionAuthPolicy =
  | Readonly<{ kind: 'public' }>
  | Readonly<{ kind: 'authenticated' }>
  | Readonly<{ kind: 'permission'; permissionId: string }>;

export type ServerFunctionIdempotencyPolicy = Readonly<{
  kind: 'invocation-key';
}>;

/** Reference-only environment requirements. Secret material never enters the profile. */
export type ServerFunctionEnvironmentPolicy = Readonly<{
  secretsByField: Readonly<Record<string, SecretRef>>;
}>;

export type ServerFunctionProfileEntry = Readonly<{
  kind: ServerFunctionKind;
  runtimeZone: Extract<RuntimeZone, 'server' | 'edge'>;
  adapterId: string;
  effect: ServerFunctionEffect;
  auth: ServerFunctionAuthPolicy;
  inputSchema: ServerRuntimeJsonSchema;
  outputSchema: ServerRuntimeJsonSchema;
  idempotency?: ServerFunctionIdempotencyPolicy;
  environment?: ServerFunctionEnvironmentPolicy;
}>;

export type ServerRuntimeProfile = Readonly<{
  schemaVersion: '1.0';
  functionsByExport: Readonly<Record<string, ServerFunctionProfileEntry>>;
}>;

export type ServerFunctionReference = Readonly<
  Pick<CodeReference, 'artifactId'> &
    Required<Pick<CodeReference, 'exportName'>>
>;

export type ServerFunctionDefinition = ServerFunctionProfileEntry &
  Readonly<{ reference: ServerFunctionReference }>;

export type AuthPermissionRequest = Readonly<{
  workspaceId: string;
  principal: AuthPrincipal;
  session: AuthSessionReference;
  permissionId: string;
  functionRef: ServerFunctionReference;
}>;

export type AuthPermissionDecision = Readonly<{
  allowed: boolean;
  code?: string;
}>;

export type AuthPermissionPort = Readonly<{
  decide(
    request: AuthPermissionRequest
  ): AuthPermissionDecision | Promise<AuthPermissionDecision>;
}>;

export type ServerRuntimeCancellationSignal = Readonly<{
  aborted: boolean;
  addEventListener(
    type: 'abort',
    listener: () => void,
    options?: Readonly<{ once?: boolean }>
  ): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}>;

export type ServerFunctionOutcome =
  | Readonly<{ kind: 'value'; value: ExecutionValue }>
  | Readonly<{ kind: 'allow' }>
  | Readonly<{ kind: 'deny'; code: string }>
  | Readonly<{
      kind: 'redirect';
      location: string;
      status: 302 | 303 | 307 | 308;
    }>;

export type ServerFunctionAdapterContext = Readonly<{
  workspaceId: string;
  invocationId: string;
  attempt: number;
  functionRef: ServerFunctionReference;
  principal?: AuthPrincipal;
  signal?: ServerRuntimeCancellationSignal;
  useSecret?(
    field: string,
    consumer: (material: string) => void | Promise<void>
  ): Promise<void>;
}>;

export type ServerFunctionAdapter = Readonly<{
  id: string;
  kinds: readonly ServerFunctionKind[];
  runtimeZones: readonly Extract<RuntimeZone, 'server' | 'edge'>[];
  effects: readonly ServerFunctionEffect[];
  execute(
    input: ExecutionValue,
    context: ServerFunctionAdapterContext
  ): ServerFunctionOutcome | Promise<ServerFunctionOutcome>;
}>;

export type ServerFunctionAdapterRegistry = Readonly<{
  register(adapter: ServerFunctionAdapter): void;
  get(adapterId: string): ServerFunctionAdapter | undefined;
  list(): readonly ServerFunctionAdapter[];
}>;

export type ExecuteServerFunctionInput = Readonly<{
  definition: ServerFunctionDefinition;
  workspaceId: string;
  invocationId: string;
  attempt: number;
  input: ExecutionValue;
  registry: ServerFunctionAdapterRegistry;
  principal?: AuthPrincipal;
  session?: AuthSessionReference;
  permissionPort?: AuthPermissionPort;
  environment?: ExecutionEnvironmentResolutionLease;
  now?: () => Date;
  signal?: ServerRuntimeCancellationSignal;
}>;

export const SERVER_ROUTE_ACTION_INPUT_FORMAT =
  'prodivix.route-action-input.v1' as const;

export type ServerRouteActionMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ServerRouteActionInput = Readonly<{
  format: typeof SERVER_ROUTE_ACTION_INPUT_FORMAT;
  route: Readonly<{
    routeNodeId: string;
    currentPath: string;
    matchedPath: string;
    params: Readonly<Record<string, string>>;
    searchParams: Readonly<Record<string, string | readonly string[]>>;
    hash?: string;
  }>;
  submission: Readonly<{
    method: ServerRouteActionMethod;
    encType: 'application/json' | 'application/x-www-form-urlencoded';
    value: ExecutionValue;
  }>;
}>;
