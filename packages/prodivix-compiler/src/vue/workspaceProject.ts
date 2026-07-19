import type { BinaryAssetMaterialization } from '@prodivix/assets';
import type { DataOperationKind } from '@prodivix/data';
import type { ExecutableProjectDataMockProvision } from '@prodivix/runtime-core';
import type { ServerRuntimeTestProvision } from '@prodivix/server-runtime';
import {
  decodeWorkspaceDataSourceDocument,
  isWorkspacePirDocument,
  validateWorkspaceSnapshot,
  type WorkspaceDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import type { CompileDiagnostic } from '#src/core/diagnostics';
import {
  createRouteExportContribution,
  createStaticDeploymentExportContribution,
} from '#src/export';
import { mergeExportDependencies } from '#src/export/dependencyPlanner';
import { createExportPackageOrigin } from '#src/export/packageOriginResolver';
import {
  VUE_VITE_DEPENDENCIES,
  VUE_VITE_DEV_DEPENDENCIES,
  VUE_VITE_PACKAGE_MANAGER,
  createVueViteExportPreset,
  createVueViteScaffoldContributions,
} from '#src/export/presets/vueVite';
import { createExportProgramBuilder } from '#src/export/programBuilder';
import { ProductionExportPlanner } from '#src/export/planner';
import type {
  ExportFileContribution,
  ExportProgram,
  ExportProgramContribution,
  ExportRouteTopology,
  ExportSourceTrace,
} from '#src/export/types';
import {
  createWorkspaceCodeContribution,
  createWorkspaceResourceContribution,
} from '#src/react/workspaceProject';
import { createWorkspaceStandaloneDataRuntimeModule } from '#src/react/standaloneDataRuntime';
import { createWorkspaceExecutionConsoleRuntimeModule } from '#src/react/standaloneExecutionConsoleRuntime';
import { createWorkspaceStandaloneServerRuntimeModule } from '#src/react/standaloneServerRuntime';
import {
  analyzeWorkspaceDataRuntimeTarget,
  PROVIDER_MOCK_DATA_RUNTIME_TARGET,
  STATIC_CLIENT_DATA_RUNTIME_TARGET,
  type WorkspaceDataRuntimeTarget,
} from '#src/react/workspaceDataRuntimeTarget';
import {
  analyzeWorkspaceServerRuntimeTarget,
  type WorkspaceServerRuntimeTarget,
} from '#src/react/workspaceServerRuntimeTarget';
import { createWorkspaceVueAppModule } from '#src/vue/workspaceApp';
import { createWorkspaceVuePirRuntimeModule } from '#src/vue/workspacePirRuntime';

export type WorkspaceVueViteCompileOptions = Readonly<{
  projectName?: string;
  dataRuntimeTarget?: WorkspaceDataRuntimeTarget;
  dataMockProvision?: ExecutableProjectDataMockProvision;
  serverRuntimeTarget?: WorkspaceServerRuntimeTarget;
  serverRuntimeMockProvision?: ServerRuntimeTestProvision;
  assetMaterializations?: readonly BinaryAssetMaterialization[];
}>;

export type VueExportBundle = Readonly<{
  type: 'project';
  target: Readonly<{ framework: 'vue'; preset: 'vite' }>;
  entryFilePath: string;
  files: ReturnType<ProductionExportPlanner['plan']>['files'];
  dependencies: ReturnType<ProductionExportPlanner['plan']>['dependencies'];
  diagnostics: readonly CompileDiagnostic[];
  metadata?: Readonly<Record<string, unknown>>;
}>;

type VueDataOperationDescriptor = Readonly<{
  key: string;
  documentId: string;
  operationId: string;
  kind: DataOperationKind;
  name: string;
}>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const sourceTraceFor = (document: WorkspaceDocument): ExportSourceTrace => ({
  sourceRef: {
    domain: 'workspace-document',
    id: document.id,
    path: document.path,
  },
});

const dataOperations = (
  workspace: WorkspaceSnapshot
): readonly VueDataOperationDescriptor[] =>
  Object.freeze(
    Object.values(workspace.docsById)
      .filter((document) => document.type === 'data-source')
      .sort(
        (left, right) =>
          compareText(left.path, right.path) || compareText(left.id, right.id)
      )
      .flatMap((document) => {
        const read = decodeWorkspaceDataSourceDocument(document);
        if (read.status !== 'valid') return [];
        return Object.values(read.decodedContent.operationsById)
          .sort((left, right) => compareText(left.id, right.id))
          .map((operation) => ({
            key: `${document.id}:${operation.id}`,
            documentId: document.id,
            operationId: operation.id,
            kind: operation.kind,
            name: operation.name?.trim() || operation.id,
          }));
      })
      .sort(
        (left, right) =>
          (left.kind === right.kind ? 0 : left.kind === 'query' ? -1 : 1) ||
          compareText(left.key, right.key)
      )
  );

const generatedFile = (
  path: string,
  contents: string,
  sourceTrace: readonly ExportSourceTrace[],
  language = 'ts'
): ExportFileContribution => ({
  id: `vue-workspace:${path}`,
  desiredPath: path,
  kind: 'source-module',
  language,
  mimeType: language === 'vue' ? 'text/x-vue' : 'text/typescript',
  importMode: 'module',
  contents,
  sourceTrace: [...sourceTrace],
  origin: {
    kind: 'generated',
    owner: 'prodivix',
    writePolicy: 'generated',
    updatePolicy: 'regenerate',
  },
});

const operationManifestSource = (
  operations: readonly VueDataOperationDescriptor[]
): string => `export type ProdivixDataOperation = Readonly<{
  key: string;
  documentId: string;
  operationId: string;
  kind: 'query' | 'mutation';
  name: string;
}>;

export const prodivixDataOperations = ${JSON.stringify(operations, null, 2)} as const satisfies readonly ProdivixDataOperation[];

export const prodivixDataOperationByKey = Object.freeze(
  Object.fromEntries(prodivixDataOperations.map((operation) => [operation.key, operation]))
) as Readonly<Record<string, ProdivixDataOperation>>;
`;

const journeyRuntimeSource = `import type { createWorkspaceDataRuntime } from './prodivix-data-runtime';
import type { ProdivixDataOperation } from './prodivix-data-operations';

export type WorkspaceDataRuntime = ReturnType<typeof createWorkspaceDataRuntime>;

export type ProdivixDataOperationResult =
  | Readonly<{ kind: 'query'; snapshot: ReturnType<WorkspaceDataRuntime['resolveDataLifecycleSnapshot']> }>
  | Readonly<{ kind: 'mutation'; value: unknown }>;

const queryRequest = (operation: ProdivixDataOperation, input: unknown) => ({
  documentId: 'prodivix-vue-target',
  instancePath: '/prodivix-vue-target',
  dataId: operation.key,
  binding: {
    operation: { documentId: operation.documentId, operationId: operation.operationId },
    input: { kind: 'literal' as const, value: input },
    activations: [{ kind: 'document' as const }],
  },
});

export const executeProdivixDataOperation = async (
  runtime: WorkspaceDataRuntime,
  operation: ProdivixDataOperation,
  input: unknown
): Promise<ProdivixDataOperationResult> => {
  if (operation.kind === 'query') {
    const request = queryRequest(operation, input);
    await runtime.activateDataBindings({
      documentId: request.documentId,
      instancePath: request.instancePath,
      bindingsByDataId: { [request.dataId]: request.binding },
      runtimeValuesById: {},
    });
    return Object.freeze({
      kind: 'query' as const,
      snapshot: runtime.resolveDataLifecycleSnapshot(request),
    });
  }
  const value = await runtime.dispatchDataMutation({
    binding: {
      kind: 'dispatch-data-operation',
      operation: { documentId: operation.documentId, operationId: operation.operationId },
      input: { kind: 'literal', value: input },
    },
    payload: null,
    runtimeValuesById: {},
    source: {
      documentId: 'prodivix-vue-target',
      nodeId: operation.key,
      eventName: 'test-operation',
      instancePath: '/prodivix-vue-target/' + operation.key,
    },
  });
  return Object.freeze({ kind: 'mutation' as const, value });
};
`;

const appSource = (
  defaultOperationKey?: string
): string => `<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { createWorkspaceDataRuntime } from './prodivix-data-runtime';
import { prodivixDataOperationByKey, prodivixDataOperations } from './prodivix-data-operations';
import { executeProdivixDataOperation } from './prodivix-data-journey';

const runtime = createWorkspaceDataRuntime();
const selectedKey = ref(${
  defaultOperationKey
    ? JSON.stringify(defaultOperationKey)
    : "prodivixDataOperations[0]?.key ?? ''"
});
const input = ref('{}');
const status = ref(prodivixDataOperations.length ? 'idle' : 'unavailable');
const output = ref('');
const selected = computed(() => prodivixDataOperationByKey[selectedKey.value]);

const run = async () => {
  if (!selected.value) return;
  status.value = 'running';
  try {
    const result = await executeProdivixDataOperation(runtime, selected.value, JSON.parse(input.value));
    status.value = result.kind === 'query' ? result.snapshot.status : 'success';
    output.value = JSON.stringify(result.kind === 'query' ? result.snapshot : result.value, null, 2);
  } catch (error) {
    status.value = 'error';
    output.value = error instanceof Error ? error.message : String(error);
  }
};

onMounted(() => { void run(); });
onUnmounted(() => runtime.dispose());
</script>

<template>
  <main class="prodivix-vue-target">
    <h1>Prodivix Vue Data Target</h1>
    <label>
      Operation
      <select v-model="selectedKey" data-testid="operation">
        <option v-for="operation in prodivixDataOperations" :key="operation.key" :value="operation.key">
          {{ operation.name }} ({{ operation.kind }})
        </option>
      </select>
    </label>
    <label>
      Input JSON
      <textarea v-model="input" data-testid="input" />
    </label>
    <button type="button" data-testid="run" @click="run">Run operation</button>
    <p data-testid="status">{{ status }}</p>
    <pre data-testid="output">{{ output }}</pre>
  </main>
</template>

<style>
:root { color-scheme: light dark; font-family: Inter, system-ui, sans-serif; }
body { margin: 0; }
.prodivix-vue-target { display: grid; gap: 1rem; max-width: 52rem; margin: 0 auto; padding: 2rem; }
label { display: grid; gap: 0.35rem; }
textarea { min-height: 8rem; font: inherit; }
pre { overflow: auto; padding: 1rem; background: color-mix(in srgb, CanvasText 8%, Canvas); }
</style>
`;

type MockCrudJourney = Readonly<{
  queryKey: string;
  mutationKey: string;
  mutationInput: Readonly<Record<string, unknown>>;
  entityIdKey: string;
  createdEntityId: string;
  full?: Readonly<{
    getKey: string;
    updateKey: string;
    deleteKey: string;
    identityInput: Readonly<Record<string, unknown>>;
    updateInput: Readonly<Record<string, unknown>>;
    updatedEntity: Readonly<Record<string, unknown>>;
  }>;
}>;

const mockCrudJourney = (
  provision: ExecutableProjectDataMockProvision | undefined,
  operations: readonly VueDataOperationDescriptor[]
): MockCrudJourney | undefined => {
  if (!provision) return undefined;
  const list = provision.fixtures.find(
    (fixture) =>
      fixture.behavior.kind === 'crud' && fixture.behavior.action === 'list'
  );
  const create = provision.fixtures.find(
    (fixture) =>
      fixture.behavior.kind === 'crud' && fixture.behavior.action === 'create'
  );
  const get = provision.fixtures.find(
    (fixture) =>
      fixture.behavior.kind === 'crud' && fixture.behavior.action === 'get'
  );
  const update = provision.fixtures.find(
    (fixture) =>
      fixture.behavior.kind === 'crud' && fixture.behavior.action === 'update'
  );
  const remove = provision.fixtures.find(
    (fixture) =>
      fixture.behavior.kind === 'crud' && fixture.behavior.action === 'delete'
  );
  if (
    !list ||
    list.behavior.kind !== 'crud' ||
    !create ||
    create.behavior.kind !== 'crud' ||
    !create.behavior.valueInputKey ||
    list.behavior.collectionId !== create.behavior.collectionId
  )
    return undefined;
  const listBehavior = list.behavior;
  const createBehavior = create.behavior;
  const valueInputKey = createBehavior.valueInputKey!;
  const collection = provision.collections?.find(
    (candidate) => candidate.id === listBehavior.collectionId
  );
  const query = operations.find(
    (operation) =>
      operation.documentId === list.documentId &&
      operation.operationId === list.operationId &&
      operation.kind === 'query'
  );
  const mutation = operations.find(
    (operation) =>
      operation.documentId === create.documentId &&
      operation.operationId === create.operationId &&
      operation.kind === 'mutation'
  );
  if (!collection || !query || !mutation) return undefined;
  const baseline = collection.initialEntities[0];
  const entity =
    baseline && typeof baseline === 'object' && !Array.isArray(baseline)
      ? { ...baseline }
      : {};
  const createdEntityId = 'prodivix-vue-created';
  const createdEntity = Object.freeze({
    ...entity,
    [collection.entityIdKey]: createdEntityId,
  });
  const fullBehaviors =
    get?.behavior.kind === 'crud' &&
    update?.behavior.kind === 'crud' &&
    remove?.behavior.kind === 'crud' &&
    get.behavior.idInputKey &&
    update.behavior.idInputKey &&
    update.behavior.valueInputKey &&
    remove.behavior.idInputKey &&
    get.behavior.idInputKey === update.behavior.idInputKey &&
    get.behavior.idInputKey === remove.behavior.idInputKey &&
    [get, update, remove].every(
      (fixture) =>
        fixture?.behavior.kind === 'crud' &&
        fixture.behavior.collectionId === listBehavior.collectionId
    )
      ? {
          get: get.behavior,
          update: update.behavior,
          remove: remove.behavior,
        }
      : undefined;
  const getOperation = fullBehaviors
    ? operations.find(
        (operation) =>
          operation.documentId === get?.documentId &&
          operation.operationId === get?.operationId &&
          operation.kind === 'query'
      )
    : undefined;
  const updateOperation = fullBehaviors
    ? operations.find(
        (operation) =>
          operation.documentId === update?.documentId &&
          operation.operationId === update?.operationId &&
          operation.kind === 'mutation'
      )
    : undefined;
  const deleteOperation = fullBehaviors
    ? operations.find(
        (operation) =>
          operation.documentId === remove?.documentId &&
          operation.operationId === remove?.operationId &&
          operation.kind === 'mutation'
      )
    : undefined;
  const updatedEntity = Object.freeze({
    ...createdEntity,
    ...(typeof entity.name === 'string'
      ? { name: `${entity.name} Updated` }
      : { prodivixUpdated: true }),
  });
  return Object.freeze({
    queryKey: query.key,
    mutationKey: mutation.key,
    mutationInput: Object.freeze({
      [valueInputKey]: Object.freeze({
        ...createdEntity,
      }),
    }),
    entityIdKey: collection.entityIdKey,
    createdEntityId,
    ...(fullBehaviors && getOperation && updateOperation && deleteOperation
      ? {
          full: Object.freeze({
            getKey: getOperation.key,
            updateKey: updateOperation.key,
            deleteKey: deleteOperation.key,
            identityInput: Object.freeze({
              [fullBehaviors.get.idInputKey!]: createdEntityId,
            }),
            updateInput: Object.freeze({
              [fullBehaviors.update.idInputKey!]: createdEntityId,
              [fullBehaviors.update.valueInputKey!]: updatedEntity,
            }),
            updatedEntity,
          }),
        }
      : {}),
  });
};

const appTestSource = (
  provision: ExecutableProjectDataMockProvision | undefined,
  journey: MockCrudJourney | undefined,
  serverProvision: ServerRuntimeTestProvision | undefined
): string => `import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkspaceDataRuntime } from './prodivix-data-runtime';
import { prodivixDataOperationByKey, prodivixDataOperations } from './prodivix-data-operations';
import { executeProdivixDataOperation } from './prodivix-data-journey';
${serverProvision ? "import { invokeWorkspaceServerFunction } from './prodivix-server-runtime';" : ''}

afterEach(() => vi.unstubAllGlobals());

describe('generated Vue Data target', () => {
  it('exports the canonical operation manifest', () => {
    expect(prodivixDataOperations.every((operation) => operation.key === operation.documentId + ':' + operation.operationId)).toBe(true);
  });
${
  provision && journey
    ? `
  it('runs the exact mock CRUD journey through the shared standalone runtime', async () => {
    const provision = ${JSON.stringify(provision)};
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) =>
      Response.json(String(input).endsWith('/.prodivix/data-runtime.json')
        ? { format: 'prodivix.executable-data-runtime.v1', mode: 'mock' }
        : provision)
    ));
    const runtime = createWorkspaceDataRuntime();
    const query = prodivixDataOperationByKey[${JSON.stringify(journey.queryKey)}]!;
    const mutation = prodivixDataOperationByKey[${JSON.stringify(journey.mutationKey)}]!;
${
  journey.full
    ? `    const get = prodivixDataOperationByKey[${JSON.stringify(journey.full.getKey)}]!;
    const update = prodivixDataOperationByKey[${JSON.stringify(journey.full.updateKey)}]!;
    const remove = prodivixDataOperationByKey[${JSON.stringify(journey.full.deleteKey)}]!;`
    : ''
}
    const before = await executeProdivixDataOperation(runtime, query, {});
    expect(before.kind).toBe('query');
    await executeProdivixDataOperation(runtime, mutation, ${JSON.stringify(journey.mutationInput)});
${
  journey.full
    ? `    const created = await executeProdivixDataOperation(runtime, get, ${JSON.stringify(journey.full.identityInput)});
    expect(created.kind).toBe('query');
    if (created.kind === 'query')
      expect(created.snapshot).toMatchObject({ status: 'success', value: expect.objectContaining({ ${JSON.stringify(journey.entityIdKey)}: ${JSON.stringify(journey.createdEntityId)} }) });
    await expect(executeProdivixDataOperation(runtime, update, ${JSON.stringify(journey.full.updateInput)})).resolves.toMatchObject({
      kind: 'mutation', value: ${JSON.stringify(journey.full.updatedEntity)}
    });
    const updated = await executeProdivixDataOperation(runtime, get, ${JSON.stringify(journey.full.identityInput)});
    expect(updated.kind).toBe('query');
    if (updated.kind === 'query')
      expect(updated.snapshot).toMatchObject({ status: 'success', value: ${JSON.stringify(journey.full.updatedEntity)} });
    await executeProdivixDataOperation(runtime, remove, ${JSON.stringify(journey.full.identityInput)});`
    : ''
}
    const after = await executeProdivixDataOperation(runtime, query, {});
    expect(after.kind).toBe('query');
    if (after.kind === 'query') {
      expect(after.snapshot.status).toBe('success');
      ${
        journey.full
          ? `expect((after.snapshot as { value?: unknown[] }).value).not.toContainEqual(
        expect.objectContaining({ ${JSON.stringify(journey.entityIdKey)}: ${JSON.stringify(journey.createdEntityId)} })
      );`
          : `expect((after.snapshot as { value?: unknown[] }).value).toContainEqual(
        expect.objectContaining({ ${JSON.stringify(journey.entityIdKey)}: ${JSON.stringify(journey.createdEntityId)} })
      );`
      }
    }
    runtime.dispose();
  });`
    : ''
}
${
  serverProvision
    ? `
  it('runs authenticated Route guard/loader/action fixtures through the source-free Server Runtime adapter', async () => {
    const provision = ${JSON.stringify(serverProvision)} as const;
    expect(provision.principal).toMatchObject({ providerId: expect.any(String), principalId: expect.any(String) });
    for (const fixture of provision.fixtures) {
      const options = { invocationId: 'vue-golden:' + fixture.id, attempt: 1 } as const;
      if (fixture.behavior.kind === 'outcome') {
        await expect(invokeWorkspaceServerFunction(fixture.functionRef, 'input' in fixture ? fixture.input : {}, options))
          .resolves.toEqual(fixture.behavior.outcome);
      } else {
        const failure = fixture.behavior as unknown as Readonly<{ code: string }>;
        await expect(invokeWorkspaceServerFunction(fixture.functionRef, 'input' in fixture ? fixture.input : {}, options))
          .rejects.toMatchObject({ code: failure.code });
      }
    }
  });`
    : ''
}
});
`;

const unsupportedDiagnostics = (
  workspace: WorkspaceSnapshot,
  hasWorkspaceProductSurface: boolean
): readonly CompileDiagnostic[] =>
  Object.values(workspace.docsById)
    .filter(
      (document) =>
        document.type !== 'data-source' &&
        document.type !== 'asset' &&
        document.type !== 'project-config' &&
        (document.type !== 'code' || !hasWorkspaceProductSurface) &&
        !isWorkspacePirDocument(document)
    )
    .sort((left, right) => compareText(left.path, right.path))
    .map((document) => ({
      code: 'VUE-TARGET-DOCUMENT-UNSUPPORTED',
      severity: 'error' as const,
      source: 'export' as const,
      message: `The Vue/Vite G2 product target does not support ${document.type} document ${document.id}.`,
      path: document.path,
    }));

const workspaceProductAppSource = `<script setup lang="ts">
import WorkspaceVueApp from './prodivix-workspace-app';
</script>

<template>
  <WorkspaceVueApp />
</template>
`;

/** Compiles the canonical Workspace into the bounded Vue/Vite G2 product target. */
export const compileWorkspaceToVueViteExportProgram = (
  workspace: WorkspaceSnapshot,
  options: WorkspaceVueViteCompileOptions = {}
): ExportProgram => {
  const preset = createVueViteExportPreset();
  const validationDiagnostics: CompileDiagnostic[] = validateWorkspaceSnapshot(
    workspace
  ).issues.map((issue) => ({
    code: issue.code,
    severity: 'error',
    source: 'export',
    message: issue.message,
    path: issue.path,
  }));
  const dataRuntime = analyzeWorkspaceDataRuntimeTarget(
    workspace,
    options.dataRuntimeTarget ??
      (options.dataMockProvision
        ? PROVIDER_MOCK_DATA_RUNTIME_TARGET
        : STATIC_CLIENT_DATA_RUNTIME_TARGET)
  );
  const operations = dataOperations(workspace);
  const documents = Object.values(workspace.docsById).sort(
    (left, right) =>
      compareText(left.path, right.path) || compareText(left.id, right.id)
  );
  const pirDocuments = documents.filter(isWorkspacePirDocument);
  const hasWorkspaceProductSurface = pirDocuments.length > 0;
  const dataDocuments = Object.values(workspace.docsById)
    .filter((document) => document.type === 'data-source')
    .sort((left, right) => compareText(left.path, right.path));
  const traces = dataDocuments.map(sourceTraceFor);
  const journey = mockCrudJourney(options.dataMockProvision, operations);
  const runtime = createWorkspaceStandaloneDataRuntimeModule(
    workspace,
    dataRuntime.target
  );
  const code = createWorkspaceCodeContribution({
    documents: documents.filter((document) => document.type === 'code'),
  });
  const routeContribution = createRouteExportContribution({
    manifest: workspace.routeManifest,
    target: preset.target,
    documentInfo: (documentId) => {
      const document = workspace.docsById[documentId];
      return document
        ? { id: document.id, path: document.path, type: document.type }
        : null;
    },
    codeArtifactInfo: (artifactId) => {
      const document = workspace.docsById[artifactId];
      return document?.type === 'code'
        ? { id: document.id, path: document.path }
        : null;
    },
  });
  const routeTopology = routeContribution.routes as ExportRouteTopology;
  const serverRuntime = analyzeWorkspaceServerRuntimeTarget(
    workspace,
    routeTopology,
    options.serverRuntimeTarget,
    options.serverRuntimeMockProvision
  );
  const vuePirRuntime = hasWorkspaceProductSurface
    ? createWorkspaceVuePirRuntimeModule(workspace)
    : undefined;
  const vueApp = hasWorkspaceProductSurface
    ? createWorkspaceVueAppModule({
        workspace,
        routeTopology,
        serverRuntime,
        executableModuleIdByArtifactId: code.executableModuleIdByArtifactId,
      })
    : undefined;
  const serverRuntimeModule = hasWorkspaceProductSurface
    ? createWorkspaceStandaloneServerRuntimeModule(
        serverRuntime.target,
        serverRuntime.bindings
      )
    : undefined;
  const executionConsoleRuntime = hasWorkspaceProductSurface
    ? createWorkspaceExecutionConsoleRuntimeModule()
    : undefined;
  const projectContribution: ExportProgramContribution = {
    roots: [
      {
        id: 'app',
        kind: 'app',
        displayName:
          options.projectName ?? workspace.name ?? 'Prodivix Vue App',
        sourceRef: { domain: 'workspace', id: workspace.id, path: '/' },
      },
    ],
    modules: [
      runtime,
      ...(executionConsoleRuntime ? [executionConsoleRuntime] : []),
      ...(serverRuntimeModule ? [serverRuntimeModule] : []),
      ...(vuePirRuntime ? [vuePirRuntime] : []),
      ...(vueApp ? [vueApp.module] : []),
    ],
    files: [
      generatedFile(
        'src/prodivix-data-operations.ts',
        operationManifestSource(operations),
        traces
      ),
      generatedFile(
        'src/prodivix-data-journey.ts',
        journeyRuntimeSource,
        traces
      ),
      generatedFile(
        'src/App.vue',
        hasWorkspaceProductSurface
          ? workspaceProductAppSource
          : appSource(journey?.queryKey),
        hasWorkspaceProductSurface
          ? [...traces, ...pirDocuments.map(sourceTraceFor)]
          : traces,
        'vue'
      ),
      generatedFile(
        'src/App.test.ts',
        appTestSource(
          options.dataMockProvision,
          journey,
          options.serverRuntimeMockProvision
        ),
        [...traces, ...pirDocuments.map(sourceTraceFor)]
      ),
    ],
    diagnostics: [
      ...validationDiagnostics,
      ...unsupportedDiagnostics(workspace, hasWorkspaceProductSurface),
      ...dataRuntime.diagnostics,
      ...(hasWorkspaceProductSurface ? serverRuntime.diagnostics : []),
      ...(vueApp?.diagnostics ?? []),
    ],
    metadata: {
      workspaceId: workspace.id,
      portabilityTarget: 'vue-vite',
      dataRuntime: {
        target: dataRuntime.target,
        requirements: dataRuntime.requirements,
      },
      mockCrudJourney: Boolean(journey),
      workspaceProductSurface: hasWorkspaceProductSurface,
      serverRuntime: {
        target: serverRuntime.target,
        requirements: serverRuntime.requirements,
      },
    },
  };
  const resourceContribution = createWorkspaceResourceContribution(
    documents,
    options.assetMaterializations
  );
  const dependencies = mergeExportDependencies([
    ...Object.entries(VUE_VITE_DEPENDENCIES).map(([name, version]) => ({
      name,
      version,
      kind: 'dependency' as const,
      origin: createExportPackageOrigin(name, version, {
        updatePolicy: 'pin',
      }),
    })),
    ...Object.entries(VUE_VITE_DEV_DEPENDENCIES).map(([name, version]) => ({
      name,
      version,
      kind: 'devDependency' as const,
      origin: createExportPackageOrigin(name, version, {
        updatePolicy: 'pin',
      }),
    })),
  ]);
  const scaffold = createVueViteScaffoldContributions({
    projectName: options.projectName ?? workspace.name ?? 'Prodivix Vue App',
    packageManager: VUE_VITE_PACKAGE_MANAGER,
    dependencies,
    entryFilePath: 'src/main.ts',
  });
  return [
    ...scaffold,
    resourceContribution,
    ...(hasWorkspaceProductSurface
      ? [
          code.contribution,
          routeContribution,
          createStaticDeploymentExportContribution({
            target: 'static-hosting',
            outputDirectory: 'dist',
          }),
        ]
      : []),
    projectContribution,
    { dependencies },
  ]
    .reduce(
      (builder, contribution) => builder.addContribution(contribution),
      createExportProgramBuilder(preset.target)
    )
    .build();
};

export const generateWorkspaceVueViteBundle = (
  workspace: WorkspaceSnapshot,
  options: WorkspaceVueViteCompileOptions = {}
): VueExportBundle => {
  const planned = new ProductionExportPlanner(createVueViteExportPreset()).plan(
    compileWorkspaceToVueViteExportProgram(workspace, options)
  );
  return {
    type: 'project',
    target: { framework: 'vue', preset: 'vite' },
    entryFilePath: planned.entryFilePath ?? 'src/main.ts',
    files: planned.files,
    dependencies: planned.dependencies,
    diagnostics: planned.diagnostics,
    ...(planned.metadata ? { metadata: planned.metadata } : {}),
  };
};
