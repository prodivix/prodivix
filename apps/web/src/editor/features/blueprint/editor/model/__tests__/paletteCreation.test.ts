import { describe, expect, it } from 'vitest';
import {
  CURRENT_PIR_VERSION,
  type PIRDocument,
} from '@prodivix/shared/types/pir';
import type {
  PaletteItemCreationRecipe,
  PaletteQueryService,
  PaletteRegistrySnapshot,
  ResolvedBlueprintCompositionRule,
} from '@/plugins/platform';
import type { ComponentPreviewItem } from '@/editor/features/blueprint/editor/model/types';
import { applyPaletteItemInsertion } from '@/editor/features/blueprint/editor/model/paletteCreation';
import {
  applyWorkspaceCommand,
  createWorkspaceHistoryState,
  pushWorkspaceHistoryEntry,
  redoWorkspaceHistory,
  undoWorkspaceHistory,
  type StableWorkspaceSnapshot,
  type WorkspaceHistoryScope,
} from '@/workspace';

const owner = Object.freeze({
  pluginId: '@prodivix/plugin-fixture',
  installationId: 'fixture-installation',
  generation: 1,
});

const createDocument = (): PIRDocument => ({
  version: CURRENT_PIR_VERSION,
  metadata: { name: 'Palette Creation' },
  ui: {
    graph: {
      version: 1,
      rootId: 'root',
      nodesById: {
        root: { id: 'root', type: 'container' },
      },
      childIdsById: { root: [] },
    },
  },
});

const createWorkspace = (document: PIRDocument): StableWorkspaceSnapshot => ({
  id: 'workspace-fixture',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  treeRootId: 'workspace-root',
  activeDocumentId: 'document-fixture',
  treeById: {
    'workspace-root': {
      id: 'workspace-root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['document-node'],
    },
    'document-node': {
      id: 'document-node',
      kind: 'doc',
      name: 'fixture.pir.json',
      parentId: 'workspace-root',
      docId: 'document-fixture',
    },
  },
  docsById: {
    'document-fixture': {
      id: 'document-fixture',
      type: 'pir-page',
      path: '/pages/fixture.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: document,
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'route-root' },
  },
});

const createPalette = (
  item: ComponentPreviewItem,
  recipe: PaletteItemCreationRecipe,
  rules: readonly ResolvedBlueprintCompositionRule[] = []
): PaletteQueryService => {
  const snapshot: PaletteRegistrySnapshot = Object.freeze({
    revision: 1,
    groups: Object.freeze([
      Object.freeze({
        id: 'fixture-group',
        title: 'Fixture',
        source: 'external' as const,
        items: [item],
      }),
    ]),
    itemsById: new Map([[item.id, item]]),
    itemsByRuntimeType: new Map(
      item.runtimeType ? [[item.runtimeType, item]] : []
    ),
    creationRecipesByItemId: new Map([[item.id, recipe]]),
    compositionRulesByRuntimeType: new Map(
      rules.map((resolved) => [resolved.rule.runtimeType, resolved])
    ),
  });
  return Object.freeze({
    getSnapshot: () => snapshot,
    getItemById: (itemId: string) => snapshot.itemsById.get(itemId),
    getItemByRuntimeType: (runtimeType: string) =>
      snapshot.itemsByRuntimeType.get(runtimeType),
    getCreationRecipe: (itemId: string) =>
      snapshot.creationRecipesByItemId.get(itemId),
    getCompositionRule: (runtimeType: string) =>
      snapshot.compositionRulesByRuntimeType.get(runtimeType),
    subscribe: () => () => undefined,
  });
};

const fieldRule: ResolvedBlueprintCompositionRule = {
  owner,
  contributionId: 'fixture.templates',
  rule: {
    id: 'fixture.field-children',
    runtimeType: 'FixtureField',
    parent: { mode: 'any' },
    slots: [
      {
        target: 'children',
        sequence: [
          {
            match: 'runtime-types',
            runtimeTypes: ['FixtureInput'],
            minItems: 1,
            maxItems: 1,
          },
        ],
      },
    ],
  },
};

const inputRule: ResolvedBlueprintCompositionRule = {
  owner,
  contributionId: 'fixture.templates',
  rule: {
    id: 'fixture.input-parent',
    runtimeType: 'FixtureInput',
    parent: { mode: 'listed', runtimeTypes: ['FixtureField'] },
    slots: [],
  },
};

describe('Palette fragment creation', () => {
  it('materializes a template with real ids and one reversible command', () => {
    const item: ComponentPreviewItem = {
      id: 'fixture-field',
      name: 'Fixture Field',
      preview: null,
      defaultProps: { tone: 'neutral' },
      statusProp: 'status',
    };
    const recipe: PaletteItemCreationRecipe = Object.freeze({
      kind: 'template',
      owner,
      paletteContributionId: 'fixture.palette',
      itemId: item.id,
      templateContributionId: 'fixture.templates',
      template: {
        id: 'fixture.field',
        palette: {
          contributionId: 'fixture.palette',
          itemId: item.id,
        },
        primaryLocalId: 'field',
        fragment: {
          rootLocalIds: ['field'],
          nodesByLocalId: {
            field: { type: 'FixtureField', props: { label: 'Field' } },
            control: { type: 'FixtureInput', props: { placeholder: 'Type' } },
          },
          childIdsByLocalId: { field: ['control'] },
        },
      },
    });
    const palette = createPalette(item, recipe, [fieldRule, inputRule]);
    const document = createDocument();

    const result = applyPaletteItemInsertion(document, palette, {
      workspaceId: 'workspace-fixture',
      documentId: 'document-fixture',
      itemId: item.id,
      preferredTargetId: 'root',
      selection: {
        selectedSize: 'large',
        selectedStatus: 'warning',
        variantProps: { tone: 'accent' },
      },
      commandId: 'command-fixture',
      issuedAt: '2026-07-11T00:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextNodeId).toBe('FixtureField-1');
    expect(result.fragment.localToNodeId).toEqual({
      control: 'FixtureInput-1',
      field: 'FixtureField-1',
    });
    expect(result.doc.ui.graph.childIdsById).toMatchObject({
      root: ['FixtureField-1'],
      'FixtureField-1': ['FixtureInput-1'],
    });
    expect(result.doc.ui.graph.nodesById['FixtureField-1']?.props).toEqual({
      label: 'Field',
      tone: 'accent',
      size: 'large',
      status: 'warning',
    });
    expect(result.command).toMatchObject({
      id: 'command-fixture',
      namespace: 'core.blueprint',
      type: 'component.insert',
      version: '1.0',
      domainHint: 'pir',
      target: {
        workspaceId: 'workspace-fixture',
        documentId: 'document-fixture',
      },
    });
    expect(result.command.forwardOps).toHaveLength(1);
    expect(result.command.reverseOps).toHaveLength(1);
    expect(result.intent.target).toEqual({ parentId: 'root', index: 0 });

    const applied = applyWorkspaceCommand(
      createWorkspace(document),
      result.command
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const scope: WorkspaceHistoryScope = {
      kind: 'document',
      workspaceId: 'workspace-fixture',
      documentId: 'document-fixture',
      domain: 'pir',
    };
    const history = pushWorkspaceHistoryEntry(createWorkspaceHistoryState(), {
      command: result.command,
    });
    const undone = undoWorkspaceHistory(applied.snapshot, history, scope);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.snapshot.docsById['document-fixture'].content).toEqual(
      document
    );

    const redone = redoWorkspaceHistory(undone.snapshot, undone.history, scope);
    expect(redone.ok).toBe(true);
    if (!redone.ok) return;
    expect(redone.snapshot.docsById['document-fixture'].content).toEqual(
      result.doc
    );
  });

  it('uses direct runtime creation without a framework component binding', () => {
    const item: ComponentPreviewItem = {
      id: 'metadata-widget',
      name: 'Metadata Widget',
      preview: null,
      runtimeType: 'MetadataWidget',
      defaultProps: { count: 2 },
    };
    const palette = createPalette(item, {
      kind: 'direct',
      owner,
      paletteContributionId: 'fixture.palette',
      itemId: item.id,
      runtimeType: 'MetadataWidget',
    });

    const result = applyPaletteItemInsertion(createDocument(), palette, {
      workspaceId: 'workspace-fixture',
      documentId: 'document-fixture',
      itemId: item.id,
      commandId: 'command-direct',
      issuedAt: '2026-07-11T00:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.ui.graph.nodesById[result.nextNodeId]).toMatchObject({
      type: 'MetadataWidget',
      props: { count: 2 },
    });
  });

  it('rejects the complete insertion when active composition is violated', () => {
    const item: ComponentPreviewItem = {
      id: 'restricted-input',
      name: 'Restricted Input',
      preview: null,
      runtimeType: 'FixtureInput',
    };
    const palette = createPalette(
      item,
      {
        kind: 'direct',
        owner,
        paletteContributionId: 'fixture.palette',
        itemId: item.id,
        runtimeType: 'FixtureInput',
      },
      [inputRule]
    );
    const document = createDocument();

    const result = applyPaletteItemInsertion(document, palette, {
      workspaceId: 'workspace-fixture',
      documentId: 'document-fixture',
      itemId: item.id,
      preferredTargetId: 'root',
      commandId: 'command-invalid',
      issuedAt: '2026-07-11T00:00:00.000Z',
    });

    expect(result).toEqual({
      ok: false,
      reason: 'Runtime type FixtureInput cannot be inserted under container.',
      compositionIssue: {
        code: 'PIR-2011',
        nodeId: expect.any(String),
        runtimeType: 'FixtureInput',
        message:
          'Runtime type FixtureInput cannot be inserted under container.',
      },
    });
    expect(document.ui.graph.childIdsById.root).toEqual([]);
  });
});
