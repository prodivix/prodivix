import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPirNodeSymbolId } from '@prodivix/authoring';
import type {
  BehaviorRecorderRawEvent,
  BehaviorScenario,
} from '@prodivix/behavior';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { buildBehaviorScenarioResourceModel } from './behaviorScenarioResourceModel';

const dispatchWorkspaceAuthoringOperation = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ status: 'applied', operationId: 'behavior-op' })
);
const dispatchWorkspaceHistoryOperation = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ status: 'applied', operationId: 'history-op' })
);

vi.mock('@/editor/workspaceSync/workspaceAuthoringOperationDispatcher', () => ({
  dispatchWorkspaceAuthoringOperation,
}));
vi.mock('@/editor/workspaceSync/workspaceHistoryOperationDispatcher', () => ({
  dispatchWorkspaceHistoryOperation,
}));

import {
  BEHAVIOR_RECORDER_EVENT,
  BehaviorScenarioResourcePage,
} from './BehaviorScenarioResourcePage';

const DIGEST = `sha256-${'d'.repeat(64)}`;
const TARGET_ID = createPirNodeSymbolId(
  'behavior-workspace',
  'catalog-page',
  'add-button'
);
const scenario: BehaviorScenario = {
  id: 'catalog-scenario',
  name: 'Catalog journey',
  criticality: 'smoke',
  tags: [],
  entry: { id: 'entry', domain: 'scenario', event: 'manual' },
  steps: [
    {
      id: 'click-add',
      kind: 'action',
      failureMode: 'stop',
      action: {
        kind: 'semantic-click',
        target: {
          kind: 'semantic-symbol',
          id: TARGET_ID,
          workspaceDocumentId: 'catalog-page',
          capability: 'behavior:pir:click',
        },
        capabilityId: 'pir.click',
        runtimeZone: 'client',
        effect: 'none',
        cancellation: 'none',
      },
    },
  ],
  fixtureRefs: [],
  controlProfileRef: {
    kind: 'preset',
    presetId: 'deterministic-default',
    digest: DIGEST,
  },
  baselineRefs: [],
  timeoutPolicy: { totalMs: 10_000, stepMs: 2_000, settleMs: 500 },
};

const workspace = (): WorkspaceSnapshot => ({
  id: 'behavior-workspace',
  workspaceRev: 5,
  routeRev: 1,
  opSeq: 4,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['page-node', 'scenario-node'],
    },
    'page-node': {
      id: 'page-node',
      kind: 'doc',
      name: 'catalog.pir.json',
      parentId: 'root',
      docId: 'catalog-page',
    },
    'scenario-node': {
      id: 'scenario-node',
      kind: 'doc',
      name: 'catalog.behavior.json',
      parentId: 'root',
      docId: scenario.id,
    },
  },
  docsById: {
    'catalog-page': {
      id: 'catalog-page',
      type: 'pir-page',
      path: '/catalog.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: {
        ui: {
          graph: {
            rootId: 'root',
            nodesById: {
              root: { id: 'root', kind: 'element', type: 'main' },
              'add-button': {
                id: 'add-button',
                kind: 'element',
                type: 'button',
              },
            },
            childIdsById: {
              root: ['add-button'],
              'add-button': [],
            },
            order: { strategy: 'childIdsById' },
          },
        },
      },
    },
    [scenario.id]: {
      id: scenario.id,
      type: 'behavior-scenario',
      path: '/catalog.behavior.json',
      contentRev: 1,
      metaRev: 1,
      content: scenario,
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'catalog-route', pageDocId: 'catalog-page' },
  },
});

beforeEach(() => {
  dispatchWorkspaceAuthoringOperation.mockClear();
  dispatchWorkspaceHistoryOperation.mockClear();
  act(() =>
    useEditorStore.setState({
      workspace: workspace(),
      workspaceReadonly: false,
    })
  );
});

afterEach(() => {
  cleanup();
  act(() =>
    useEditorStore.setState({ workspace: null, workspaceReadonly: false })
  );
});

describe('Behavior Scenario resource authoring', () => {
  it('builds selector-free target choices from Semantic Index capabilities', () => {
    const model = buildBehaviorScenarioResourceModel(workspace());
    expect(model.semanticStatus).toBe('ready');
    expect(model.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capability: 'behavior:pir:click',
          target: {
            kind: 'semantic-symbol',
            id: TARGET_ID,
            workspaceDocumentId: 'catalog-page',
            capability: 'behavior:pir:click',
          },
          action: expect.objectContaining({
            kind: 'semantic-click',
            capabilityId: 'pir.click',
          }),
        }),
        expect.objectContaining({
          capability: 'behavior:route:lifecycle',
          trigger: { domain: 'route', event: 'entered' },
        }),
      ])
    );
    expect(JSON.stringify(model.targets)).not.toMatch(
      /css|xpath|querySelector|domHandle|reactFiber/i
    );
  });

  it('stages a semantic entry trigger through the shared picker', async () => {
    const user = userEvent.setup();
    const routeTrigger = buildBehaviorScenarioResourceModel(
      workspace()
    ).targets.find(
      ({ trigger }) =>
        trigger?.domain === 'route' && trigger.event === 'entered'
    );
    expect(routeTrigger).toBeTruthy();
    if (!routeTrigger?.trigger) return;
    render(<BehaviorScenarioResourcePage />);
    const picker = screen.getByRole('combobox', {
      name: 'resourceManager.behavior.editor.entryTrigger',
    });
    expect(picker.tagName).toBe('BUTTON');
    await user.click(picker);
    await user.click(
      screen.getByRole('option', {
        name: `${routeTrigger.label} — route.entered`,
      })
    );
    expect(dispatchWorkspaceAuthoringOperation).not.toHaveBeenCalled();
    expect(
      screen.getByLabelText('resourceManager.behavior.preview.title')
    ).toBeTruthy();
    await user.click(
      screen.getByRole('button', {
        name: 'resourceManager.behavior.actions.confirm',
      })
    );
    await waitFor(() =>
      expect(dispatchWorkspaceAuthoringOperation).toHaveBeenCalledTimes(1)
    );
    expect(
      dispatchWorkspaceAuthoringOperation.mock.calls[0]?.[0]?.operation
    ).toMatchObject({
      kind: 'command',
      command: {
        namespace: 'core.behavior',
        type: 'document.update',
        forwardOps: expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              domain: 'route',
              event: 'entered',
              target: routeTrigger.target,
            }),
          }),
        ]),
      },
    });
  });

  it('requires impact confirmation before dispatching a reversible edit', async () => {
    render(<BehaviorScenarioResourcePage />);
    const name = screen.getByLabelText('resourceManager.behavior.editor.name');
    fireEvent.change(name, { target: { value: 'Renamed journey' } });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'resourceManager.behavior.actions.stage',
      })
    );
    expect(dispatchWorkspaceAuthoringOperation).not.toHaveBeenCalled();
    expect(
      screen.getByLabelText('resourceManager.behavior.preview.title')
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'resourceManager.behavior.actions.confirm',
      })
    );
    await waitFor(() =>
      expect(dispatchWorkspaceAuthoringOperation).toHaveBeenCalledTimes(1)
    );
    const operation =
      dispatchWorkspaceAuthoringOperation.mock.calls[0]?.[0]?.operation;
    expect(operation).toMatchObject({
      kind: 'command',
      command: {
        namespace: 'core.behavior',
        type: 'document.update',
        target: { documentId: scenario.id },
      },
    });
  });

  it('stages valid create and delete commands through explicit previews', async () => {
    render(<BehaviorScenarioResourcePage />);
    fireEvent.change(
      screen.getByLabelText('resourceManager.behavior.create.name'),
      { target: { value: 'Created journey' } }
    );
    const initialTarget = screen.getByLabelText(
      'resourceManager.behavior.create.initialTarget'
    );
    expect(initialTarget.tagName).toBe('BUTTON');
    const createButton = screen.getByRole('button', {
      name: 'resourceManager.behavior.actions.create',
    });
    await waitFor(() =>
      expect((createButton as HTMLButtonElement).disabled).toBe(false)
    );
    fireEvent.click(createButton);
    expect(dispatchWorkspaceAuthoringOperation).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'resourceManager.behavior.actions.confirm',
      })
    );
    await waitFor(() =>
      expect(dispatchWorkspaceAuthoringOperation).toHaveBeenCalledTimes(1)
    );
    expect(
      dispatchWorkspaceAuthoringOperation.mock.calls[0]?.[0]?.operation
    ).toMatchObject({
      kind: 'command',
      command: {
        type: 'document.create-at-path',
        forwardOps: expect.arrayContaining([
          expect.objectContaining({
            value: expect.objectContaining({
              type: 'behavior-scenario',
              content: expect.objectContaining({
                name: 'Created journey',
                steps: [expect.objectContaining({ kind: 'action' })],
              }),
            }),
          }),
        ]),
      },
    });

    dispatchWorkspaceAuthoringOperation.mockClear();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'resourceManager.behavior.actions.delete',
      })
    );
    expect(dispatchWorkspaceAuthoringOperation).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'resourceManager.behavior.actions.confirm',
      })
    );
    await waitFor(() =>
      expect(dispatchWorkspaceAuthoringOperation).toHaveBeenCalledTimes(1)
    );
    expect(
      dispatchWorkspaceAuthoringOperation.mock.calls[0]?.[0]?.operation
    ).toMatchObject({
      kind: 'command',
      command: {
        type: 'document.delete',
        forwardOps: expect.arrayContaining([
          expect.objectContaining({
            op: 'remove',
            path: `/docsById/${scenario.id}`,
          }),
        ]),
      },
    });
  });

  it('redacts sensitive recorder input before draft review and cancellation writes nothing', () => {
    render(<BehaviorScenarioResourcePage />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'resourceManager.behavior.actions.record',
      })
    );
    const raw: BehaviorRecorderRawEvent = {
      id: 'password-event',
      kind: 'input',
      fieldName: 'password',
      value: 'Bearer never-persist-this',
      targetCandidates: [
        {
          kind: 'semantic-symbol',
          id: TARGET_ID,
          workspaceDocumentId: 'catalog-page',
          capability: 'behavior:pir:input',
        },
      ],
    };
    act(() =>
      window.dispatchEvent(
        new CustomEvent(BEHAVIOR_RECORDER_EVENT, { detail: raw })
      )
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'resourceManager.behavior.actions.stop',
      })
    );
    expect(screen.getByText('sensitive')).toBeTruthy();
    expect(document.body.textContent).not.toContain('never-persist-this');
    fireEvent.click(
      screen.getByRole('button', {
        name: 'resourceManager.behavior.actions.cancel',
      })
    );
    expect(dispatchWorkspaceAuthoringOperation).not.toHaveBeenCalled();
  });
});
