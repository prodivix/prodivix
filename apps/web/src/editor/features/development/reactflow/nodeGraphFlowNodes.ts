import type { MouseEvent } from 'react';
import type { Node } from '@xyflow/react';
import type { GraphNodeData } from './GraphNode';
import {
  createBindingId,
  createBranchId,
  createFetchStatusId,
  createNodeId,
  createSwitchCaseId,
  resolveNodeValidationMessage,
  sanitizeFieldValue,
} from './nodeGraphEditorModel';
import {
  estimateStickyNoteSize,
  normalizeBindingEntries,
  normalizeBranches,
  normalizeCases,
  normalizeStatusCodes,
} from './graphNodeShared';
import type { NodeGraphRenderRuntime } from './nodeGraphRenderStore';

type BuildRuntimeNodeDataParams = {
  node: Node<GraphNodeData>;
  runtime: NodeGraphRenderRuntime;
};

export const buildRuntimeNodeData = ({
  node,
  runtime,
}: BuildRuntimeNodeDataParams): GraphNodeData => {
  const {
    bindCodeArtifact,
    codeArtifacts,
    edges,
    groupAutoLayoutById,
    hintText,
    openCodeSlotDefinition,
    setEdges,
    setHint,
    setMenu,
    setNodes,
    updateCodeArtifactSource,
    validationText,
  } = runtime;
  const codeArtifact = node.data.executor
    ? codeArtifacts.find(
        (artifact) => artifact.id === node.data.executor?.reference.artifactId
      )
    : undefined;

  return {
    ...node.data,
    onPortContextMenu: (
      event: MouseEvent,
      nodeId: string,
      handleId: string,
      role: 'source' | 'target'
    ) => {
      event.preventDefault();
      event.stopPropagation();
      setMenu({
        kind: 'port',
        x: event.clientX,
        y: event.clientY,
        nodeId,
        handleId,
        role,
      });
    },
    onAddCase: (nodeId: string) => {
      setNodes((current) =>
        current.map((item) => {
          if (item.id !== nodeId || item.data.kind !== 'switch') return item;
          const cases = normalizeCases(item.data.cases);
          return {
            ...item,
            data: {
              ...item.data,
              cases: [
                ...cases,
                {
                  id: createSwitchCaseId(),
                  label: `case-${cases.length + 1}`,
                },
              ],
            },
          };
        })
      );
    },
    onRemoveCase: (nodeId: string, caseId: string) => {
      let blocked = false;
      setNodes((current) =>
        current.map((item) => {
          if (item.id !== nodeId || item.data.kind !== 'switch') return item;
          const cases = normalizeCases(item.data.cases);
          if (cases.length <= 1) {
            blocked = true;
            return item;
          }
          return {
            ...item,
            data: {
              ...item.data,
              cases: cases.filter((caseItem) => caseItem.id !== caseId),
            },
          };
        })
      );
      if (blocked) {
        setHint(hintText.keepAtLeastOneCase);
        return;
      }
      setEdges((current) =>
        current.filter(
          (edge) =>
            !(
              (edge.source === nodeId &&
                edge.sourceHandle === `out.control.case-${caseId}`) ||
              (edge.target === nodeId &&
                edge.targetHandle === `in.condition.case-${caseId}`)
            )
        )
      );
    },
    onChangeBranchLabel: (nodeId: string, branchId: string, label: string) => {
      setNodes((current) =>
        current.map((item) => {
          if (item.id !== nodeId) return item;
          if (item.data.kind === 'switch') {
            const cases = normalizeCases(item.data.cases);
            return {
              ...item,
              data: {
                ...item.data,
                cases: cases.map((caseItem) =>
                  caseItem.id === branchId ? { ...caseItem, label } : caseItem
                ),
              },
            };
          }
          if (item.data.kind !== 'parallel' && item.data.kind !== 'race') {
            return item;
          }
          const branches = normalizeBranches(item.data.branches);
          return {
            ...item,
            data: {
              ...item.data,
              branches: branches.map((branch) =>
                branch.id === branchId ? { ...branch, label } : branch
              ),
            },
          };
        })
      );
    },
    onAddBranch: (nodeId: string) => {
      setNodes((current) =>
        current.map((item) => {
          if (
            item.id !== nodeId ||
            (item.data.kind !== 'parallel' && item.data.kind !== 'race')
          ) {
            return item;
          }
          const branches = normalizeBranches(item.data.branches);
          return {
            ...item,
            data: {
              ...item.data,
              branches: [
                ...branches,
                {
                  id: createBranchId(),
                  label: `branch-${branches.length + 1}`,
                },
              ],
            },
          };
        })
      );
    },
    onRemoveBranch: (nodeId: string, branchId: string) => {
      let blocked = false;
      setNodes((current) =>
        current.map((item) => {
          if (
            item.id !== nodeId ||
            (item.data.kind !== 'parallel' && item.data.kind !== 'race')
          ) {
            return item;
          }
          const branches = normalizeBranches(item.data.branches);
          if (branches.length <= 1) {
            blocked = true;
            return item;
          }
          return {
            ...item,
            data: {
              ...item.data,
              branches: branches.filter((branch) => branch.id !== branchId),
            },
          };
        })
      );
      if (blocked) {
        setHint(hintText.keepAtLeastOneBranch);
        return;
      }
      setEdges((current) =>
        current.filter(
          (edge) =>
            !(
              edge.source === nodeId &&
              edge.sourceHandle === `out.control.branch-${branchId}`
            )
        )
      );
    },
    onAddStatusCode: (nodeId: string) => {
      setNodes((current) =>
        current.map((item) => {
          if (item.id !== nodeId || item.data.kind !== 'fetch') return item;
          const statusCodes = normalizeStatusCodes(item.data.statusCodes);
          return {
            ...item,
            data: {
              ...item.data,
              statusCodes: [
                ...statusCodes,
                { id: createFetchStatusId(), code: '200' },
              ],
            },
          };
        })
      );
    },
    onRemoveStatusCode: (nodeId: string, statusId: string) => {
      let blocked = false;
      setNodes((current) =>
        current.map((item) => {
          if (item.id !== nodeId || item.data.kind !== 'fetch') return item;
          const statusCodes = normalizeStatusCodes(item.data.statusCodes);
          if (statusCodes.length <= 1) {
            blocked = true;
            return item;
          }
          return {
            ...item,
            data: {
              ...item.data,
              statusCodes: statusCodes.filter((entry) => entry.id !== statusId),
            },
          };
        })
      );
      if (blocked) {
        setHint(hintText.keepAtLeastOneStatus);
        return;
      }
      setEdges((current) =>
        current.filter(
          (edge) =>
            !(
              edge.source === nodeId &&
              edge.sourceHandle === `out.control.status-${statusId}`
            )
        )
      );
    },
    onChangeStatusCode: (nodeId: string, statusId: string, code: string) => {
      setNodes((current) =>
        current.map((item) => {
          if (item.id !== nodeId || item.data.kind !== 'fetch') return item;
          const statusCodes = normalizeStatusCodes(item.data.statusCodes);
          return {
            ...item,
            data: {
              ...item.data,
              statusCodes: statusCodes.map((entry) =>
                entry.id === statusId ? { ...entry, code } : entry
              ),
            },
          };
        })
      );
    },
    onChangeMethod: (nodeId: string, method: string) => {
      setNodes((current) =>
        current.map((item) =>
          item.id === nodeId && item.data.kind === 'fetch'
            ? { ...item, data: { ...item.data, method } }
            : item
        )
      );
    },
    onChangeField: (nodeId: string, field: string, value: string) => {
      const nextValue = sanitizeFieldValue(field, value);
      setNodes((current) =>
        current.map((item) =>
          item.id === nodeId
            ? { ...item, data: { ...item.data, [field]: nextValue } }
            : item
        )
      );
    },
    onAddKeyValueEntry: (nodeId: string) => {
      setNodes((current) =>
        current.map((item) => {
          if (item.id !== nodeId) return item;
          const entries = Array.isArray(item.data.keyValueEntries)
            ? item.data.keyValueEntries
            : [];
          return {
            ...item,
            data: {
              ...item.data,
              keyValueEntries: [
                ...entries,
                { id: createNodeId(), key: '', value: '' },
              ],
            },
          };
        })
      );
    },
    onRemoveKeyValueEntry: (nodeId: string, entryId: string) => {
      let blocked = false;
      setNodes((current) =>
        current.map((item) => {
          if (item.id !== nodeId) return item;
          const entries = Array.isArray(item.data.keyValueEntries)
            ? item.data.keyValueEntries
            : [];
          const requireMinOne =
            item.data.kind === 'setState' ||
            item.data.kind === 'computed' ||
            item.data.kind === 'renderComponent' ||
            item.data.kind === 'conditionalRender' ||
            item.data.kind === 'listRender';
          if (requireMinOne && entries.length <= 1) {
            blocked = true;
            return item;
          }
          return {
            ...item,
            data: {
              ...item.data,
              keyValueEntries: entries.filter((entry) => entry.id !== entryId),
            },
          };
        })
      );
      if (blocked) {
        setHint(hintText.keepAtLeastOneEntry);
      }
    },
    onChangeKeyValueEntry: (nodeId: string, entryId: string, field, value) => {
      setNodes((current) =>
        current.map((item) => {
          if (item.id !== nodeId) return item;
          const entries = Array.isArray(item.data.keyValueEntries)
            ? item.data.keyValueEntries
            : [];
          return {
            ...item,
            data: {
              ...item.data,
              keyValueEntries: entries.map((entry) =>
                entry.id === entryId ? { ...entry, [field]: value } : entry
              ),
            },
          };
        })
      );
    },
    onAddBindingEntry: (nodeId: string, binding) => {
      setNodes((current) =>
        current.map((item) => {
          if (item.id !== nodeId || item.data.kind !== 'subFlowCall') {
            return item;
          }
          const entries = normalizeBindingEntries(item.data[binding]);
          return {
            ...item,
            data: {
              ...item.data,
              [binding]: [
                ...entries,
                { id: createBindingId(), key: '', value: '' },
              ],
            },
          };
        })
      );
    },
    onRemoveBindingEntry: (nodeId: string, binding, entryId: string) => {
      let blocked = false;
      setNodes((current) =>
        current.map((item) => {
          if (item.id !== nodeId || item.data.kind !== 'subFlowCall') {
            return item;
          }
          const entries = normalizeBindingEntries(item.data[binding]);
          if (entries.length <= 1) {
            blocked = true;
            return item;
          }
          return {
            ...item,
            data: {
              ...item.data,
              [binding]: entries.filter((entry) => entry.id !== entryId),
            },
          };
        })
      );
      if (blocked) {
        setHint(hintText.keepAtLeastOneBinding);
      }
    },
    onChangeBindingEntry: (nodeId: string, binding, entryId, field, value) => {
      setNodes((current) =>
        current.map((item) => {
          if (item.id !== nodeId || item.data.kind !== 'subFlowCall') {
            return item;
          }
          const entries = normalizeBindingEntries(item.data[binding]);
          return {
            ...item,
            data: {
              ...item.data,
              [binding]: entries.map((entry) =>
                entry.id === entryId ? { ...entry, [field]: value } : entry
              ),
            },
          };
        })
      );
    },
    onToggleCollapse: (nodeId: string) => {
      setNodes((current) =>
        current.map((item) =>
          item.id === nodeId
            ? {
                ...item,
                data: {
                  ...item.data,
                  collapsed: !item.data.collapsed,
                },
              }
            : item
        )
      );
    },
    onChangeValue: (nodeId: string, value: string) => {
      setNodes((current) =>
        current.map((item) =>
          item.id === nodeId &&
          (item.data.kind === 'string' ||
            item.data.kind === 'number' ||
            item.data.kind === 'boolean' ||
            item.data.kind === 'object' ||
            item.data.kind === 'array' ||
            item.data.kind === 'fetch')
            ? { ...item, data: { ...item.data, value } }
            : item
        )
      );
    },
    onChangeExpression: (nodeId: string, expression: string) => {
      setNodes((current) =>
        current.map((item) =>
          item.id === nodeId && item.data.kind === 'expression'
            ? { ...item, data: { ...item.data, expression } }
            : item
        )
      );
    },
    code: codeArtifact?.source ?? '',
    codeLanguage:
      codeArtifact?.language === 'glsl' || codeArtifact?.language === 'wgsl'
        ? codeArtifact.language
        : codeArtifact?.language === 'js'
          ? 'js'
          : 'ts',
    codeArtifactOptions: codeArtifacts.map((artifact) => ({
      id: artifact.id,
      path: artifact.path,
      language: artifact.language,
    })),
    onBindCodeArtifact: bindCodeArtifact,
    onOpenCodeSlotDefinition: openCodeSlotDefinition,
    onChangeCode: (_nodeId: string, code: string) => {
      if (codeArtifact) updateCodeArtifactSource(codeArtifact.id, code);
    },
    onChangeCodeLanguage: undefined,
    onChangeCodeSize: (nodeId: string, codeSize) => {
      setNodes((current) =>
        current.map((item) =>
          item.id === nodeId && item.data.kind === 'code'
            ? { ...item, data: { ...item.data, codeSize } }
            : item
        )
      );
    },
    autoBoxWidth:
      node.data.kind === 'groupBox'
        ? groupAutoLayoutById.get(node.id)?.width
        : undefined,
    autoBoxHeight:
      node.data.kind === 'groupBox'
        ? groupAutoLayoutById.get(node.id)?.height
        : undefined,
    autoNoteWidth:
      node.data.kind === 'stickyNote'
        ? estimateStickyNoteSize(node.data.description ?? node.data.value ?? '')
            .width
        : undefined,
    autoNoteHeight:
      node.data.kind === 'stickyNote'
        ? estimateStickyNoteSize(node.data.description ?? node.data.value ?? '')
            .height
        : undefined,
    validationMessage: resolveNodeValidationMessage(
      node,
      edges,
      validationText
    ),
    hasUrlInput:
      node.data.kind === 'fetch'
        ? edges.some(
            (edge) =>
              edge.target === node.id && edge.targetHandle === 'in.data.url'
          )
        : undefined,
  };
};
