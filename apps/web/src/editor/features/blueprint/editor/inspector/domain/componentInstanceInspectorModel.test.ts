import { describe, expect, it } from 'vitest';
import type {
  PIRComponentContract,
  PIRComponentInstanceNode,
  PIRDocument,
} from '@prodivix/pir';
import type { PIRRenderLocation } from '@prodivix/pir-react-renderer';
import type { WorkspaceDocument, WorkspaceSnapshot } from '@prodivix/workspace';
import {
  clearComponentInstancePropBinding,
  createComponentInstanceInspectorModel,
  setComponentInstanceLiteralPropBinding,
  setComponentInstanceVariantBinding,
} from '@/editor/features/blueprint/editor/inspector/domain/componentInstanceInspectorModel';

const contract: PIRComponentContract = {
  propsById: {
    source: {
      id: 'source',
      name: 'Source',
      typeRef: 'User',
      required: true,
    },
    title: {
      id: 'title',
      name: 'Title',
      typeRef: 'string',
      required: true,
      defaultValue: 'Untitled',
    },
  },
  eventsById: {
    submit: {
      id: 'submit',
      name: 'Submit',
      payloadTypeRef: 'SubmitPayload',
    },
  },
  slotsById: {
    content: {
      id: 'content',
      name: 'Content',
      minChildren: 2,
      maxChildren: 3,
    },
  },
  variantAxesById: {
    tone: {
      id: 'tone',
      name: 'Tone',
      required: true,
      defaultOptionId: 'neutral',
      optionsById: {
        neutral: { id: 'neutral', name: 'Neutral' },
        strong: { id: 'strong', name: 'Strong' },
      },
    },
  },
};

const instance: PIRComponentInstanceNode = {
  id: 'card-instance',
  kind: 'component-instance',
  componentDocumentId: 'card-definition',
  bindings: {
    props: {
      source: {
        kind: 'code',
        reference: { artifactId: 'load-user', exportName: 'loadUser' },
      },
      title: { kind: 'literal', value: 'Welcome' },
      hiddenInternal: { kind: 'literal', value: true },
    },
    events: {
      submit: {
        kind: 'call-code',
        slotId: 'card.submit',
        reference: { artifactId: 'submit-handler', exportName: 'submit' },
      },
    },
    variants: {},
  },
};

const definitionContent: PIRDocument = {
  metadata: { name: 'Card' },
  componentContract: contract,
  ui: {
    graph: {
      rootId: 'definition-root',
      nodesById: {
        'definition-root': {
          id: 'definition-root',
          kind: 'element',
          type: 'article',
        },
      },
      childIdsById: { 'definition-root': [] },
      order: { strategy: 'childIdsById' },
    },
  },
};

const pageContent: PIRDocument = {
  ui: {
    graph: {
      rootId: 'page-root',
      nodesById: {
        'page-root': {
          id: 'page-root',
          kind: 'element',
          type: 'main',
        },
        [instance.id]: instance,
        'slot-child': {
          id: 'slot-child',
          kind: 'element',
          type: 'span',
        },
      },
      childIdsById: {
        'page-root': [instance.id],
        [instance.id]: [],
        'slot-child': [],
      },
      regionsById: {
        [instance.id]: { content: ['slot-child'] },
      },
      order: { strategy: 'childIdsById' },
    },
  },
};

const document = (
  id: string,
  type: WorkspaceDocument['type'],
  path: string,
  content: unknown
): WorkspaceDocument => ({
  id,
  type,
  path,
  contentRev: 1,
  metaRev: 1,
  content,
});

const workspace: WorkspaceSnapshot = {
  id: 'workspace-component-inspector',
  workspaceRev: 4,
  routeRev: 2,
  opSeq: 8,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: [],
    },
  },
  docsById: {
    page: document('page', 'pir-page', '/pages/home.pir.json', pageContent),
    'card-definition': document(
      'card-definition',
      'pir-component',
      '/components/card.pir.json',
      definitionContent
    ),
  },
  routeManifest: { version: '1', root: { id: 'route-root' } },
};

const location: PIRRenderLocation = {
  documentId: 'page',
  nodeId: instance.id,
  instancePath: '/page/card-instance',
  role: 'source',
};

describe('Component Instance Inspector model', () => {
  it('projects only Public Contract members with bindings and region diagnostics', () => {
    const model = createComponentInstanceInspectorModel(workspace, location);

    expect(model.status).toBe('ready');
    if (model.status !== 'ready') return;

    expect(model.definition).toMatchObject({
      documentId: 'card-definition',
      name: 'Card',
      path: '/components/card.pir.json',
    });
    expect(model.props.map(({ id }) => id)).toEqual(['source', 'title']);
    expect(model.props.find(({ id }) => id === 'source')).toMatchObject({
      bindingKind: 'reference',
      codeArtifactId: 'load-user',
    });
    expect(model.events[0]).toMatchObject({
      id: 'submit',
      codeArtifactId: 'submit-handler',
    });
    expect(model.slots[0]).toMatchObject({
      id: 'content',
      childCount: 1,
      missingChildCount: 1,
      required: true,
    });
    expect(model.variants[0]).toMatchObject({
      id: 'tone',
      effectiveOptionId: 'neutral',
      required: true,
    });
    expect(model.variants[0]).not.toHaveProperty('selectedOptionId');
    expect(model.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'WKS_COMPONENT_PROP_NOT_EXPOSED',
        'WKS_COMPONENT_REQUIRED_VARIANT_MISSING',
        'WKS_COMPONENT_SLOT_CARDINALITY',
      ])
    );
  });

  it('builds exposed literal and variant updates without replacing complex bindings', () => {
    const model = createComponentInstanceInspectorModel(workspace, location);
    expect(model.status).toBe('ready');
    if (model.status !== 'ready') return;

    const literalUpdate = setComponentInstanceLiteralPropBinding(
      model,
      'title',
      'Updated'
    );
    expect(literalUpdate).toMatchObject({
      documentId: 'page',
      instanceNodeId: 'card-instance',
      bindings: {
        props: { title: { kind: 'literal', value: 'Updated' } },
      },
    });
    expect(
      setComponentInstanceLiteralPropBinding(model, 'source', null)
    ).toBeNull();
    expect(
      setComponentInstanceLiteralPropBinding(model, 'hiddenInternal', true)
    ).toBeNull();

    expect(
      setComponentInstanceVariantBinding(model, 'tone', 'strong')
    ).toMatchObject({ bindings: { variants: { tone: 'strong' } } });
    expect(
      setComponentInstanceVariantBinding(model, 'tone', 'unknown-option')
    ).toBeNull();
    expect(
      clearComponentInstancePropBinding(model, 'title')?.bindings.props
    ).not.toHaveProperty('title');
  });

  it('stays hidden for selections that are not Component Instances', () => {
    expect(
      createComponentInstanceInspectorModel(workspace, {
        ...location,
        nodeId: 'page-root',
      })
    ).toEqual({
      status: 'hidden',
      reason: 'selection-not-component-instance',
    });
  });
});
