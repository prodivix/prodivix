import {
  createExecutableProjectSnapshot,
  DEFAULT_EXECUTABLE_PROJECT_SERVER_FUNCTION_INVOCATION_PATH,
  DEFAULT_EXECUTABLE_PROJECT_SERVER_FUNCTION_RESULT_PATH,
  EXECUTABLE_PROJECT_SERVER_FUNCTION_PLAN_FORMAT,
  type ExecutableProjectSnapshot,
  type ExecutionSourceTrace,
} from '@prodivix/runtime-core';
import {
  decodeServerRuntimeProfile,
  ISOLATED_SERVER_FUNCTION_ADAPTER_ID,
  ISOLATED_SERVER_FUNCTION_AUTHORITY_FORMAT,
  ISOLATED_SERVER_FUNCTION_AUTHORITY_MAX_TTL_MS,
  ISOLATED_SERVER_FUNCTION_AUTHORITY_MAX_PERMISSIONS,
  ISOLATED_SERVER_FUNCTION_AUTHORITY_PATH,
  ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_FORMAT,
  ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_PATH,
  ISOLATED_SERVER_FUNCTION_SECRET_MAX_FIELDS,
  ISOLATED_SERVER_FUNCTION_SECRET_MAX_MATERIAL_BYTES,
  ISOLATED_SERVER_FUNCTION_WORKSPACE_OWNER_PERMISSION_ID,
  PRODIVIX_PRODUCT_SESSION_AUTH_PROVIDER_ID,
  resolveServerFunctionDefinition,
  type ServerFunctionProfileEntry,
  type ServerFunctionReference,
} from '@prodivix/server-runtime';
import {
  isWorkspaceCodeDocumentContent,
  readWorkspaceServerRuntimeAuthConfiguration,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import type { CompileDiagnostic } from '#src/core/diagnostics';
import { buildWorkspaceIsolatedServerFunctionImportGraph } from '#src/executableProject/isolatedServerFunctionImportGraph';
import { createWorkspaceExecutionSnapshotRef } from '#src/executableProject/workspaceExecutableProject';

const runnerPath = 'src/.prodivix/server-runtime/invoke.mjs';
const sourcePath = 'src/.prodivix/server-runtime/function.mjs';
const generatedPackagePath = 'package.json';
export { ISOLATED_SERVER_FUNCTION_ADAPTER_ID };

export type IsolatedServerFunctionExecutableProjectResult =
  | Readonly<{ status: 'ready'; snapshot: ExecutableProjectSnapshot }>
  | Readonly<{ status: 'blocked'; diagnostics: readonly CompileDiagnostic[] }>;

export type GenerateIsolatedServerFunctionExecutableProjectOptions = Readonly<{
  functionRef: ServerFunctionReference;
}>;

const diagnostic = (
  code: string,
  message: string,
  path: string
): CompileDiagnostic =>
  Object.freeze({ code, severity: 'error', source: 'export', message, path });

const runtimeManifest = (
  exportName: string,
  entry: ServerFunctionProfileEntry
) =>
  Object.freeze({
    schemaVersion: '1.0' as const,
    functionsByExport: Object.freeze({ [exportName]: entry }),
  });

const createRunnerSource = (input: {
  workspaceId: string;
  snapshotId: string;
  functionRef: ServerFunctionReference;
  definition: ServerFunctionProfileEntry;
}): string => {
  const configuration = JSON.stringify({
    workspaceId: input.workspaceId,
    snapshotId: input.snapshotId,
    functionRef: input.functionRef,
    definition: input.definition,
    invocationFilePath:
      DEFAULT_EXECUTABLE_PROJECT_SERVER_FUNCTION_INVOCATION_PATH,
    resultFilePath: DEFAULT_EXECUTABLE_PROJECT_SERVER_FUNCTION_RESULT_PATH,
    authorityFilePath: ISOLATED_SERVER_FUNCTION_AUTHORITY_PATH,
    secretMaterialFilePath: ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_PATH,
  });
  return `import { readFile, rm, writeFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';

const configuration = Object.freeze(${configuration});
const requestType = 'prodivix.execution-server-function-gateway-request.v1';
const responseType = 'prodivix.execution-server-function-gateway-response.v1';
const authorityType = '${ISOLATED_SERVER_FUNCTION_AUTHORITY_FORMAT}';
const maximumAuthorityTtlMs = ${ISOLATED_SERVER_FUNCTION_AUTHORITY_MAX_TTL_MS};
const maximumAuthorityPermissions = ${ISOLATED_SERVER_FUNCTION_AUTHORITY_MAX_PERMISSIONS};
const secretMaterialType = '${ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_FORMAT}';
const maximumSecretFields = ${ISOLATED_SERVER_FUNCTION_SECRET_MAX_FIELDS};
const maximumSecretMaterialBytes = ${ISOLATED_SERVER_FUNCTION_SECRET_MAX_MATERIAL_BYTES};

class RuntimeFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const exactRecord = (value, required, optional = []) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
    ? value
    : undefined;
};

const cloneValue = (value, depth = 0, budget = { nodes: 0 }) => {
  if (depth > 64 || ++budget.nodes > 65536) throw new RuntimeFailure('SVR_REQUEST_INVALID');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((entry) => cloneValue(entry, depth + 1, budget));
  if (!value || typeof value !== 'object' || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null))
    throw new RuntimeFailure('SVR_REQUEST_INVALID');
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry, depth + 1, budget)]));
};

const readRequest = async () => {
  const parsed = JSON.parse(await readFile(configuration.invocationFilePath, 'utf8'));
  const record = exactRecord(parsed, ['type', 'requestId', 'invocationId', 'attempt', 'functionRef', 'input']);
  const reference = exactRecord(record?.functionRef, ['artifactId', 'exportName']);
  if (!record || record.type !== requestType || !reference ||
    record.requestId !== record.invocationId + ':' + record.attempt ||
    !Number.isSafeInteger(record.attempt) || record.attempt < 1 || record.attempt > 10 ||
    reference.artifactId !== configuration.functionRef.artifactId ||
    reference.exportName !== configuration.functionRef.exportName)
    throw new RuntimeFailure('SVR_REQUEST_INVALID');
  return Object.freeze({ ...record, input: cloneValue(record.input) });
};

const authorityIdentifier = (value) =>
  typeof value === 'string' && value.length > 0 && value.length <= 4096 &&
  value === value.trim() && !/[\\u0000-\\u001f\\u007f]/u.test(value)
    ? value
    : undefined;

const authorityPermissionId = (value) =>
  typeof value === 'string' && value.length > 0 && value.length <= 256 &&
  value === value.trim() && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
    ? value
    : undefined;

const authorityPermissions = (value) => {
  if (!Array.isArray(value) || value.length > maximumAuthorityPermissions) return undefined;
  const permissions = value.map(authorityPermissionId);
  if (permissions.some((permission) => permission === undefined) ||
    permissions.some((permission, index) => index > 0 && permissions[index - 1].localeCompare(permission) >= 0))
    return undefined;
  return Object.freeze(permissions);
};

const readAuthority = async () => {
  if (configuration.definition.auth.kind === 'public') {
    await rm(configuration.authorityFilePath, { force: true });
    return undefined;
  }
  if (configuration.definition.auth.kind !== 'authenticated' &&
    configuration.definition.auth.kind !== 'permission')
    throw new RuntimeFailure('SVR_AUTHORITY_INVALID');
  let serialized;
  try {
    serialized = await readFile(configuration.authorityFilePath, 'utf8');
  } catch {
    throw new RuntimeFailure('SVR_AUTHORITY_INVALID');
  } finally {
    await rm(configuration.authorityFilePath, { force: true });
  }
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new RuntimeFailure('SVR_AUTHORITY_INVALID');
  }
  const record = exactRecord(parsed, ['format', 'workspaceId', 'snapshotId', 'principal', 'permissions', 'expiresAt']);
  const principal = exactRecord(record?.principal, ['providerId', 'principalId']);
  const providerId = authorityIdentifier(principal?.providerId);
  const principalId = authorityIdentifier(principal?.principalId);
  const permissions = authorityPermissions(record?.permissions);
  const now = Date.now();
  if (!record || record.format !== authorityType ||
    record.workspaceId !== configuration.workspaceId ||
    record.snapshotId !== configuration.snapshotId ||
    !providerId || !principalId || !permissions || !Number.isSafeInteger(record.expiresAt) ||
    record.expiresAt <= now || record.expiresAt > now + maximumAuthorityTtlMs)
    throw new RuntimeFailure('SVR_AUTHORITY_INVALID');
  if (configuration.definition.auth.kind === 'permission' &&
    !permissions.includes(configuration.definition.auth.permissionId))
    throw new RuntimeFailure('SVR_AUTHORITY_INVALID');
  return Object.freeze({ providerId, principalId });
};

const readSecrets = async () => {
  if (!configuration.definition.environment) {
    await rm(configuration.secretMaterialFilePath, { force: true });
    return undefined;
  }
  let serialized;
  try {
    serialized = await readFile(configuration.secretMaterialFilePath, 'utf8');
  } catch {
    throw new RuntimeFailure('SVR_ENVIRONMENT_LEASE_MISSING');
  } finally {
    await rm(configuration.secretMaterialFilePath, { force: true });
  }
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new RuntimeFailure('SVR_ENVIRONMENT_LEASE_MISSING');
  }
  const record = exactRecord(parsed, ['format', 'fields']);
  if (!record || record.format !== secretMaterialType || !record.fields ||
    typeof record.fields !== 'object' || Array.isArray(record.fields))
    throw new RuntimeFailure('SVR_ENVIRONMENT_LEASE_MISSING');
  const expectedFields = Object.keys(configuration.definition.environment.secretsByField).sort();
  const fields = Object.keys(record.fields);
  if (!expectedFields.length || expectedFields.length > maximumSecretFields ||
    JSON.stringify(fields) !== JSON.stringify(expectedFields))
    throw new RuntimeFailure('SVR_ENVIRONMENT_LEASE_MISSING');
  for (const field of fields) {
    const material = record.fields[field];
    if (!authorityPermissionId(field) || typeof material !== 'string' || !material.length ||
      Buffer.byteLength(material, 'utf8') > maximumSecretMaterialBytes)
      throw new RuntimeFailure('SVR_ENVIRONMENT_LEASE_MISSING');
  }
  return record.fields;
};

const containsSecretMaterial = (value, materials) => {
  if (typeof value === 'string') return materials.some((material) => material && value.includes(material));
  if (Array.isArray(value)) return value.some((entry) => containsSecretMaterial(entry, materials));
  if (value && typeof value === 'object')
    return Object.entries(value).some(([key, entry]) => containsSecretMaterial(key, materials) || containsSecretMaterial(entry, materials));
  return false;
};

const validate = (schema, value, code) => {
  const validator = new Ajv2020({ allErrors: true, messages: false, strict: false, validateFormats: false }).compile(schema);
  if (!validator(value)) throw new RuntimeFailure(code);
};

const normalizeOutcome = (raw) => {
  const kind = raw?.kind;
  if (kind === 'value') {
    const record = exactRecord(raw, ['kind', 'value']);
    if (!record || configuration.definition.kind === 'route-guard') throw new RuntimeFailure('SVR_OUTCOME_INVALID');
    const value = cloneValue(record.value);
    validate(configuration.definition.outputSchema, value, 'SVR_OUTPUT_INVALID');
    return Object.freeze({ kind, value });
  }
  if (kind === 'allow') {
    if (!exactRecord(raw, ['kind']) || configuration.definition.kind !== 'route-guard') throw new RuntimeFailure('SVR_OUTCOME_INVALID');
    return Object.freeze({ kind });
  }
  if (kind === 'deny') {
    const record = exactRecord(raw, ['kind', 'code']);
    if (!record || configuration.definition.kind !== 'route-guard' || typeof record.code !== 'string' || !/^[A-Z][A-Z0-9_-]{0,127}$/u.test(record.code))
      throw new RuntimeFailure('SVR_OUTCOME_INVALID');
    return Object.freeze({ kind, code: record.code });
  }
  if (kind === 'redirect') {
    const record = exactRecord(raw, ['kind', 'location', 'status']);
    if (!record || configuration.definition.kind === 'function' || typeof record.location !== 'string' ||
      !record.location.startsWith('/') || record.location.startsWith('//') || record.location.length > 2048 ||
      ![302, 303, 307, 308].includes(record.status))
      throw new RuntimeFailure('SVR_OUTCOME_INVALID');
    return Object.freeze({ kind, location: record.location, status: record.status });
  }
  throw new RuntimeFailure('SVR_OUTCOME_INVALID');
};

const persist = async (response) => {
  await rm(configuration.resultFilePath, { force: true });
  await writeFile(configuration.resultFilePath, JSON.stringify(response) + '\\n', { flag: 'wx', mode: 0o600 });
};

let request;
try {
  request = await readRequest();
  const principal = await readAuthority();
  const secretFields = await readSecrets();
  const secretMaterials = [];
  const useSecret = secretFields
    ? async (field, consumer) => {
        if (!authorityPermissionId(field) || typeof consumer !== 'function' || !Object.hasOwn(secretFields, field))
          throw new RuntimeFailure('SVR_SECRET_BINDING_MISSING');
        const material = secretFields[field];
        secretMaterials.push(material);
        try {
          await consumer(material);
        } catch {
          throw new RuntimeFailure('SVR_SECRET_OUTPUT_LEAK');
        }
      }
    : undefined;
  validate(configuration.definition.inputSchema, request.input, 'SVR_INPUT_INVALID');
  const module = await import('./function.mjs');
  const implementation = module[configuration.functionRef.exportName];
  if (typeof implementation !== 'function') throw new RuntimeFailure('SVR_ADAPTER_MISSING');
  let result;
  try {
    result = normalizeOutcome(await implementation(request.input, Object.freeze({
      workspaceId: configuration.workspaceId,
      invocationId: request.invocationId,
      attempt: request.attempt,
      functionRef: configuration.functionRef,
      ...(principal ? { principal } : {}),
      ...(useSecret ? { useSecret } : {}),
    })));
    if (containsSecretMaterial(result, secretMaterials)) throw new RuntimeFailure('SVR_SECRET_OUTPUT_LEAK');
  } finally {
    secretMaterials.fill('');
    if (secretFields) Object.keys(secretFields).forEach((field) => { secretFields[field] = ''; });
  }
  await persist(Object.freeze({ type: responseType, requestId: request.requestId, ok: true, result }));
} catch (error) {
  const code = error instanceof RuntimeFailure ? error.code : 'SVR_ISOLATED_EXECUTION_FAILED';
  await persist(Object.freeze({
    type: responseType,
    requestId: request?.requestId ?? 'invalid:1',
    ok: false,
    error: Object.freeze({ code, retryable: false }),
  }));
}
`;
};

const sourceTrace = (
  workspace: WorkspaceSnapshot,
  artifactId: string
): readonly ExecutionSourceTrace[] => {
  const document = workspace.docsById[artifactId];
  return Object.freeze([
    Object.freeze({
      sourceRef: Object.freeze({ kind: 'code-artifact' as const, artifactId }),
      label: document?.path ?? artifactId,
    }),
  ]);
};

/** Compiles one exact public/read code export and its bounded canonical import graph. */
export const generateWorkspaceIsolatedServerFunctionExecutableProject = (
  workspace: WorkspaceSnapshot,
  options: GenerateIsolatedServerFunctionExecutableProjectOptions
): IsolatedServerFunctionExecutableProjectResult => {
  const document = workspace.docsById[options.functionRef.artifactId];
  const path = document?.path ?? `/documents/${options.functionRef.artifactId}`;
  if (
    !document ||
    document.type !== 'code' ||
    !isWorkspaceCodeDocumentContent(document.content) ||
    (document.content.language !== 'ts' && document.content.language !== 'js')
  )
    return Object.freeze({
      status: 'blocked',
      diagnostics: Object.freeze([
        diagnostic(
          'WKS-EXPORT-SERVER-ISOLATED-SOURCE-INVALID',
          'The isolated Server Function target requires one TypeScript or JavaScript code document.',
          path
        ),
      ]),
    });
  const decoded = decodeServerRuntimeProfile(
    document.content.metadata,
    document.content.language
  );
  const definition =
    decoded.status === 'valid'
      ? resolveServerFunctionDefinition(
          decoded.profile,
          options.functionRef.artifactId,
          options.functionRef.exportName
        )
      : undefined;
  if (!definition)
    return Object.freeze({
      status: 'blocked',
      diagnostics: Object.freeze([
        diagnostic(
          'WKS-EXPORT-SERVER-ISOLATED-DEFINITION-MISSING',
          'The isolated Server Function export must exist in the canonical runtime profile.',
          path
        ),
      ]),
    });
  if (
    definition.adapterId !== ISOLATED_SERVER_FUNCTION_ADAPTER_ID ||
    (definition.auth.kind !== 'public' &&
      definition.auth.kind !== 'authenticated' &&
      !(
        definition.auth.kind === 'permission' &&
        definition.auth.permissionId ===
          ISOLATED_SERVER_FUNCTION_WORKSPACE_OWNER_PERMISSION_ID
      )) ||
    definition.effect !== 'read' ||
    definition.runtimeZone !== 'server'
  )
    return Object.freeze({
      status: 'blocked',
      diagnostics: Object.freeze([
        diagnostic(
          'WKS-EXPORT-SERVER-ISOLATED-POLICY-UNSUPPORTED',
          'The isolated target accepts only public, authenticated, or workspace.owner permission read/server prodivix.code-export functions.',
          path
        ),
      ]),
    });
  if (definition.auth.kind !== 'public') {
    const authConfigurationRead =
      readWorkspaceServerRuntimeAuthConfiguration(workspace);
    if (authConfigurationRead.status === 'invalid') {
      const issue = authConfigurationRead.issues[0];
      return Object.freeze({
        status: 'blocked',
        diagnostics: Object.freeze([
          diagnostic(
            'WKS-EXPORT-SERVER-AUTH-CONFIG-INVALID',
            issue?.message ??
              'The isolated target requires a valid Auth configuration.',
            issue?.path ?? '/config/auth.json'
          ),
        ]),
      });
    }
    if (!authConfigurationRead.configuration) {
      return Object.freeze({
        status: 'blocked',
        diagnostics: Object.freeze([
          diagnostic(
            'WKS-EXPORT-SERVER-AUTH-CONFIG-REQUIRED',
            'The isolated target requires the canonical /config/auth.json declaration for protected functions.',
            '/config/auth.json'
          ),
        ]),
      });
    }
    if (
      authConfigurationRead.configuration.providerId !==
      PRODIVIX_PRODUCT_SESSION_AUTH_PROVIDER_ID
    ) {
      return Object.freeze({
        status: 'blocked',
        diagnostics: Object.freeze([
          diagnostic(
            'WKS-EXPORT-SERVER-AUTH-PROVIDER-UNSUPPORTED',
            `The isolated target does not support Auth provider ${authConfigurationRead.configuration.providerId}.`,
            '/config/auth.json/providerId'
          ),
        ]),
      });
    }
    if (
      definition.auth.kind === 'permission' &&
      !authConfigurationRead.configuration.permissionIds.includes(
        definition.auth.permissionId
      )
    ) {
      return Object.freeze({
        status: 'blocked',
        diagnostics: Object.freeze([
          diagnostic(
            'WKS-EXPORT-SERVER-PERMISSION-UNDECLARED',
            `Server Function permission is not declared by /config/auth.json: ${definition.auth.permissionId}.`,
            '/config/auth.json/permissionIds'
          ),
        ]),
      });
    }
  }
  const importGraph = buildWorkspaceIsolatedServerFunctionImportGraph(
    workspace,
    document.id,
    sourcePath
  );
  if (importGraph.status === 'blocked')
    return Object.freeze({
      status: 'blocked',
      diagnostics: Object.freeze([
        diagnostic(
          'WKS-EXPORT-SERVER-ISOLATED-MODULE-UNSUPPORTED',
          importGraph.message,
          importGraph.documentPath
        ),
      ]),
    });
  const { reference: _reference, ...profileEntry } = definition;
  const manifest = runtimeManifest(
    definition.reference.exportName,
    Object.freeze(profileEntry)
  );
  const traces = sourceTrace(workspace, document.id);
  const workspaceRef = createWorkspaceExecutionSnapshotRef(workspace);
  const snapshot = createExecutableProjectSnapshot({
    workspace: workspaceRef,
    target: Object.freeze({
      presetId: 'isolated-server-function',
      framework: 'typescript',
      runtime: 'node',
    }),
    files: Object.freeze([
      Object.freeze({
        path: generatedPackagePath,
        contents: `${JSON.stringify({
          name: 'prodivix-isolated-server-function',
          private: true,
          type: 'module',
          dependencies: { ajv: '8.20.0' },
        })}\n`,
      }),
      Object.freeze({
        path: runnerPath,
        contents: createRunnerSource({
          workspaceId: workspace.id,
          snapshotId: workspaceRef.snapshotId,
          functionRef: definition.reference,
          definition: profileEntry,
        }),
        sourceTrace: traces,
      }),
      ...importGraph.files,
    ]),
    dependencyPlan: { manifestFilePath: generatedPackagePath },
    entrypoints: Object.freeze([
      Object.freeze({ kind: 'production' as const, path: runnerPath }),
    ]),
    capabilityRequirements: Object.freeze({
      preview: Object.freeze([]),
      build: Object.freeze([]),
      test: Object.freeze([]),
      production: Object.freeze([
        'artifacts',
        'cancellation',
        'dependency-install',
        'filesystem',
        ...(definition.environment ? (['environment-binding'] as const) : []),
        'server-function',
        'source-trace',
        'streaming-logs',
        'timeout',
      ] as const),
    }),
    publicBuildConfiguration: Object.freeze([]),
    resourceHints: Object.freeze({
      cpuCores: 1,
      memoryMb: 256,
      diskMb: 512,
      timeoutMs: 30_000,
      maxOutputBytes: 1024 * 1024,
    }),
    cacheHints: Object.freeze({ dependencyInstall: 'isolated' }),
    installCommand: Object.freeze({
      command: 'npm',
      args: Object.freeze([
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--package-lock=false',
      ]),
    }),
    previewCommand: Object.freeze({
      command: 'node',
      args: Object.freeze(['-e', 'process.exit(125)']),
    }),
    buildCommand: Object.freeze({
      command: 'node',
      args: Object.freeze(['-e', 'process.exit(125)']),
    }),
    previewPlan: Object.freeze({
      command: Object.freeze({
        command: 'node',
        args: Object.freeze(['-e', 'process.exit(125)']),
      }),
      outputDirectoryPath: 'dist',
      entryFilePath: 'index.html',
    }),
    buildPlan: Object.freeze({ outputDirectoryPath: 'dist' }),
    testPlan: Object.freeze({
      framework: 'vitest',
      command: Object.freeze({
        command: 'node',
        args: Object.freeze(['-e', 'process.exit(125)']),
      }),
      reportFilePath: '.prodivix/test-report.json',
    }),
    serverFunctionPlan: Object.freeze({
      format: EXECUTABLE_PROJECT_SERVER_FUNCTION_PLAN_FORMAT,
      command: Object.freeze({
        command: 'node',
        args: Object.freeze([runnerPath]),
      }),
      entrypointFilePath: runnerPath,
      sourceFilePath: sourcePath,
      functionRef: definition.reference,
      runtimeManifest: manifest,
    }),
  });
  return Object.freeze({ status: 'ready', snapshot });
};
