import { describe, expect, it } from 'vitest';
import {
  createAuthoringDiagnosticProviderRegistry,
  createAuthoringEnvironment,
  createCodeArtifactProviderRegistry,
  createCodeSlotRegistry,
  createCodeSymbolProviderRegistry,
  createEmptyAuthoringEnvironment,
  createWorkspaceCodeArtifactProvider,
} from '@/authoring';
import { createDiagnostic, COD_DIAGNOSTIC_DEFINITIONS } from '@/diagnostics';
import type {
  AuthoringContext,
  AuthoringDiagnosticProvider,
  CodeArtifact,
  CodeArtifactProvider,
  CodeReference,
  CodeSlotContract,
  CodeSlotProvider,
  CodeScope,
  CodeSymbol,
  CodeSymbolProvider,
} from '@/authoring';

describe('authoring environment contract', () => {
  it('keeps code artifacts, symbols, and scopes addressable by stable owners', () => {
    const artifact: CodeArtifact = {
      id: 'artifact-1',
      path: '/src/actions/onClick.ts',
      language: 'ts',
      owner: {
        kind: 'inspector-field',
        documentId: 'doc-1',
        nodeId: 'node-1',
        fieldPath: 'events.onClick',
      },
      source: 'return $state.count;',
      revision: 'rev-1',
    };

    const scope: CodeScope = {
      id: 'scope-node-1',
      kind: 'pir-node',
      ownerRef: {
        kind: 'pir-node',
        documentId: 'doc-1',
        nodeId: 'node-1',
      },
    };

    const symbol: CodeSymbol = {
      id: 'symbol-count',
      name: '$state.count',
      kind: 'state',
      source: { kind: 'pir', documentId: 'doc-1' },
      scopeId: scope.id,
      targetRef: scope.ownerRef,
    };

    expect(artifact.owner).toMatchObject({
      kind: 'inspector-field',
      fieldPath: 'events.onClick',
    });
    expect(symbol).toMatchObject({
      id: 'symbol-count',
      scopeId: 'scope-node-1',
      targetRef: { kind: 'pir-node', nodeId: 'node-1' },
    });
  });

  it('provides a safe empty implementation for early adapters', () => {
    const environment = createEmptyAuthoringEnvironment('rev-empty');
    const context = { surface: 'code-editor' as const };
    const reference = { name: '$state.count' };

    expect(environment.revision).toBe('rev-empty');
    expect(environment.querySymbols(context)).toEqual([]);
    expect(environment.resolveReference(reference, context)).toBeNull();
    expect(environment.getCompletions(context)).toEqual([]);
    expect(environment.getDiagnostics(context)).toEqual([]);
    expect(environment.getDefinition(reference, context)).toBeNull();
    expect(environment.getReferences('symbol-count', context)).toEqual([]);
  });

  it('registers code artifact providers without depending on editor internals', () => {
    const context: AuthoringContext = {
      surface: 'inspector',
      targetRef: {
        kind: 'inspector-field',
        documentId: 'doc-1',
        nodeId: 'node-1',
        fieldPath: 'events.onClick',
      },
    };
    const artifact: CodeArtifact = {
      id: 'artifact-inspector-on-click',
      path: '/src/actions/onClick.ts',
      language: 'ts',
      owner: context.targetRef,
      source: 'return true;',
      revision: 'rev-1',
    };
    const provider: CodeArtifactProvider = {
      id: 'test-provider',
      source: { kind: 'code', artifactId: artifact.id },
      listArtifacts: (inputContext) =>
        inputContext.surface === 'inspector' ? [artifact] : [],
      getArtifact: (id) => (id === artifact.id ? artifact : null),
    };
    const registry = createCodeArtifactProviderRegistry();

    registry.register(provider);

    expect(registry.listProviders()).toEqual([provider]);
    expect(registry.listArtifacts(context)).toEqual([artifact]);
    expect(registry.getArtifact(artifact.id)).toBe(artifact);
    expect(registry.getArtifact('missing-artifact')).toBeNull();

    registry.unregister(provider.id);

    expect(registry.listProviders()).toEqual([]);
    expect(registry.listArtifacts(context)).toEqual([]);
    expect(registry.getArtifact(artifact.id)).toBeNull();
  });

  it('registers code symbol providers without depending on editor internals', () => {
    const context: AuthoringContext = {
      surface: 'code-editor',
      scopeId: 'scope-doc-1',
    };
    const scope: CodeScope = {
      id: 'scope-doc-1',
      kind: 'document',
      ownerRef: { kind: 'document', documentId: 'doc-1' },
    };
    const symbol: CodeSymbol = {
      id: 'symbol-route-id',
      name: 'routeId',
      kind: 'route',
      source: { kind: 'route', routeId: 'route-1' },
      scopeId: scope.id,
      targetRef: { kind: 'route', routeId: 'route-1' },
    };
    const provider: CodeSymbolProvider = {
      id: 'test-symbol-provider',
      source: { kind: 'route', routeId: 'route-1' },
      listSymbols: (inputContext) =>
        inputContext.scopeId === scope.id ? [symbol] : [],
      listScopes: () => [scope],
      getSymbol: (id) => (id === symbol.id ? symbol : null),
    };
    const registry = createCodeSymbolProviderRegistry();

    registry.register(provider);

    expect(registry.listProviders()).toEqual([provider]);
    expect(registry.listSymbols(context)).toEqual([symbol]);
    expect(registry.listScopes(context)).toEqual([scope]);
    expect(registry.getSymbol(symbol.id)).toBe(symbol);
    expect(registry.getSymbol('missing-symbol')).toBeNull();

    registry.unregister(provider.id);

    expect(registry.listProviders()).toEqual([]);
    expect(registry.listSymbols(context)).toEqual([]);
    expect(registry.listScopes(context)).toEqual([]);
    expect(registry.getSymbol(symbol.id)).toBeNull();
  });

  it('registers diagnostic providers without deciding UI behavior', () => {
    const context: AuthoringContext = {
      surface: 'code-editor',
      artifactId: 'artifact-1',
    };
    const diagnostic = createDiagnostic({
      ...COD_DIAGNOSTIC_DEFINITIONS.COD_1001,
      message: 'Code parse failed.',
      sourceSpan: {
        artifactId: 'artifact-1',
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 4,
      },
    });
    const provider: AuthoringDiagnosticProvider = {
      id: 'test-diagnostic-provider',
      source: { kind: 'code', artifactId: 'artifact-1' },
      getDiagnostics: (inputContext) =>
        inputContext.artifactId === 'artifact-1' ? [diagnostic] : [],
    };
    const registry = createAuthoringDiagnosticProviderRegistry();

    registry.register(provider);

    expect(registry.listProviders()).toEqual([provider]);
    expect(registry.getDiagnostics(context)).toEqual([diagnostic]);
    expect(registry.getDiagnostics({ surface: 'code-editor' })).toEqual([]);

    registry.unregister(provider.id);

    expect(registry.listProviders()).toEqual([]);
    expect(registry.getDiagnostics(context)).toEqual([]);
  });

  it('projects workspace code documents into code artifacts', () => {
    const provider = createWorkspaceCodeArtifactProvider({
      id: 'workspace-1',
      workspaceRev: 1,
      routeRev: 1,
      opSeq: 1,
      treeRootId: 'root',
      treeById: {
        root: {
          id: 'root',
          kind: 'dir',
          name: '/',
          parentId: null,
          children: ['src', 'pages'],
        },
        src: {
          id: 'src',
          kind: 'dir',
          name: 'src',
          parentId: 'root',
          children: ['open-dialog-node'],
        },
        'open-dialog-node': {
          id: 'open-dialog-node',
          kind: 'doc',
          name: 'openDialog.ts',
          parentId: 'src',
          docId: 'code-open-dialog',
        },
        pages: {
          id: 'pages',
          kind: 'dir',
          name: 'pages',
          parentId: 'root',
          children: ['home-node'],
        },
        'home-node': {
          id: 'home-node',
          kind: 'doc',
          name: 'home.pir.json',
          parentId: 'pages',
          docId: 'page-home',
        },
      },
      docsById: {
        'code-open-dialog': {
          id: 'code-open-dialog',
          type: 'code',
          path: '/src/actions/openDialog.ts',
          contentRev: 7,
          metaRev: 1,
          content: {
            language: 'ts',
            source: 'export function openDialog() {}',
          },
        },
        'page-home': {
          id: 'page-home',
          type: 'pir-page',
          path: '/pages/home.pir.json',
          contentRev: 1,
          metaRev: 1,
          content: {},
        },
      },
      routeManifest: { version: '1', root: { id: 'route-root' } },
    });

    expect(provider.listArtifacts({ surface: 'code-editor' })).toEqual([
      {
        id: 'code-open-dialog',
        path: '/src/actions/openDialog.ts',
        language: 'ts',
        owner: { kind: 'workspace-module', documentId: 'code-open-dialog' },
        source: 'export function openDialog() {}',
        revision: '7',
      },
    ]);
    expect(provider.getArtifact('code-open-dialog')).toMatchObject({
      id: 'code-open-dialog',
      path: '/src/actions/openDialog.ts',
    });
    expect(provider.getArtifact('missing-code')).toBeNull();
  });

  it('registers code slot providers without owning bindings or source', () => {
    const ownerRef = {
      kind: 'pir-node' as const,
      documentId: 'doc-1',
      nodeId: 'button-1',
    };
    const slot: CodeSlotContract = {
      id: 'blueprint.button-1.onClick',
      ownerRef,
      kind: 'event-handler',
      inputTypeRef: 'MouseEvent',
      outputTypeRef: 'void',
      capabilityIds: ['browser-event'],
      defaultPlacement: ['inspector-field', 'code-editor', 'issues-panel'],
    };
    const provider: CodeSlotProvider = {
      id: 'test-slot-provider',
      source: { kind: 'pir', documentId: 'doc-1' },
      listSlots: (context) =>
        context.targetRef?.kind === 'pir-node' ? [slot] : [],
      getSlot: (id) => (id === slot.id ? slot : null),
    };
    const registry = createCodeSlotRegistry();

    registry.register(provider);

    expect(
      registry.listSlots({ surface: 'inspector', targetRef: ownerRef })
    ).toEqual([slot]);
    expect(registry.getSlot(slot.id)).toBe(slot);
    expect(registry.listSlotsByOwner(ownerRef)).toEqual([slot]);

    registry.unregister(provider.id);

    expect(registry.listProviders()).toEqual([]);
    expect(registry.getSlot(slot.id)).toBeNull();
  });

  it('uses artifact identity for persistent code references', () => {
    const reference: CodeReference = {
      artifactId: 'code-open-dialog',
      exportName: 'openDialog',
    };

    expect(reference).toEqual({
      artifactId: 'code-open-dialog',
      exportName: 'openDialog',
    });
    expect('path' in reference).toBe(false);
  });

  it('composes symbol and diagnostic registries into an authoring environment', () => {
    const context: AuthoringContext = {
      surface: 'code-editor',
      scopeId: 'scope-doc-1',
      artifactId: 'artifact-1',
    };
    const symbol: CodeSymbol = {
      id: 'symbol-count',
      name: '$state.count',
      kind: 'state',
      source: { kind: 'pir', documentId: 'doc-1' },
      scopeId: 'scope-doc-1',
      typeRef: 'number',
    };
    const diagnostic = createDiagnostic({
      ...COD_DIAGNOSTIC_DEFINITIONS.COD_2001,
      message: 'Symbol cannot be resolved.',
    });
    const symbolRegistry = createCodeSymbolProviderRegistry();
    const diagnosticRegistry = createAuthoringDiagnosticProviderRegistry();

    symbolRegistry.register({
      id: 'test-symbol-provider',
      source: { kind: 'pir', documentId: 'doc-1' },
      listSymbols: (inputContext) =>
        inputContext.scopeId === 'scope-doc-1' ? [symbol] : [],
      listScopes: () => [],
      getSymbol: (id) => (id === symbol.id ? symbol : null),
    });
    diagnosticRegistry.register({
      id: 'test-diagnostic-provider',
      source: { kind: 'code', artifactId: 'artifact-1' },
      getDiagnostics: (inputContext) =>
        inputContext.artifactId === 'artifact-1' ? [diagnostic] : [],
    });

    const environment = createAuthoringEnvironment({
      revision: 'rev-1',
      symbolRegistry,
      diagnosticRegistry,
    });

    expect(environment.revision).toBe('rev-1');
    expect(environment.querySymbols(context)).toEqual([symbol]);
    expect(environment.getCompletions(context)).toEqual([
      {
        label: '$state.count',
        symbolId: 'symbol-count',
        detail: 'number',
      },
    ]);
    expect(environment.getDiagnostics(context)).toEqual([diagnostic]);
    expect(
      environment.resolveReference({ artifactId: 'artifact-1' }, context)
    ).toBeNull();
    expect(
      environment.getDefinition({ artifactId: 'artifact-1' }, context)
    ).toBeNull();
    expect(environment.getReferences(symbol.id, context)).toEqual([]);
  });
});
