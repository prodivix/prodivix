import CodeMirror from '@uiw/react-codemirror';
import { autocompletion, completeFromList } from '@codemirror/autocomplete';
import {
  CODE_LANGUAGE_KEYWORDS,
  renderSource,
  renderTarget,
  resolveCodeLanguageExtension,
  resolveMultiplicity,
  type GraphNodeData,
} from '@/editor/features/development/reactflow/graphNodeShared';
import { codeMirrorTypographyTheme } from '@/editor/codeMirrorTypography';
import {
  buildNodeContainerClass,
  CollapseSummary,
  NodeHeader,
  SelectField,
} from './nodePrimitives';
import type { NodeI18n } from './nodeI18n';
import { tNode } from './nodeI18n';

type Props = {
  id: string;
  nodeData: GraphNodeData;
  selected: boolean;
  t: NodeI18n;
};

export const renderCodeGraphNode = ({ id, nodeData, selected, t }: Props) => {
  const isCollapsed = Boolean(nodeData.collapsed);
  const codeSize = nodeData.codeSize ?? 'md';
  const codeLanguage = nodeData.codeLanguage ?? 'tsx';
  const widthClass =
    codeSize === 'lg'
      ? 'min-w-[560px]'
      : codeSize === 'sm'
        ? 'min-w-[320px]'
        : 'min-w-[440px]';
  const lineCount = (nodeData.code ?? '').split('\n').length;
  const languageExtension = resolveCodeLanguageExtension(codeLanguage);
  const completionExtension = autocompletion({
    override: [completeFromList(CODE_LANGUAGE_KEYWORDS[codeLanguage])],
  });
  const artifactId = nodeData.executor?.reference.artifactId ?? '';
  const artifactOptions = (nodeData.codeArtifactOptions ?? []).filter(
    (artifact) =>
      artifact.language === 'ts' ||
      artifact.language === 'js' ||
      artifact.language === 'glsl' ||
      artifact.language === 'wgsl'
  );
  return (
    <div className={buildNodeContainerClass(selected, widthClass)}>
      <NodeHeader
        title={nodeData.label}
        collapsed={isCollapsed}
        onToggleCollapse={() => nodeData.onToggleCollapse?.(id)}
        collapseAriaLabel={
          isCollapsed
            ? tNode(t, 'common.aria.expandKind', 'expand {{kind}}', {
                kind: nodeData.label,
              })
            : tNode(t, 'common.aria.collapseKind', 'collapse {{kind}}', {
                kind: nodeData.label,
              })
        }
        leftSlot={renderTarget(
          id,
          'in.control.prev',
          'control',
          resolveMultiplicity('target', 'control'),
          undefined,
          nodeData.onPortContextMenu
        )}
        summary={
          isCollapsed ? (
            <CollapseSummary
              text={tNode(t, 'code.lineCount', '{{count}} lines', {
                count: lineCount,
              })}
            />
          ) : null
        }
        actions={
          <div className="flex items-center gap-1">
            <SelectField
              value={codeLanguage}
              onChange={(value) =>
                nodeData.onChangeCodeLanguage?.(
                  id,
                  value as NonNullable<GraphNodeData['codeLanguage']>
                )
              }
              options={[
                { value: 'jsx', label: 'jsx' },
                { value: 'tsx', label: 'tsx' },
                { value: 'js', label: 'js' },
                { value: 'ts', label: 'ts' },
                { value: 'glsl', label: 'glsl' },
                { value: 'wgsl', label: 'wgsl' },
              ]}
              className="h-6 px-1.5 text-[10px]"
              disabled
            />
            <SelectField
              value={codeSize}
              onChange={(value) =>
                nodeData.onChangeCodeSize?.(
                  id,
                  value as NonNullable<GraphNodeData['codeSize']>
                )
              }
              options={[
                { value: 'sm', label: 'S' },
                { value: 'md', label: 'M' },
                { value: 'lg', label: 'L' },
              ]}
              className="h-6 px-1.5 text-[10px]"
            />
          </div>
        }
      />
      {isCollapsed ? (
        <div className="px-4 pb-2" />
      ) : (
        <div className="relative px-3.5 pb-3">
          <div className="mb-2 flex items-center gap-2">
            <SelectField
              value={artifactId}
              onChange={(value) =>
                nodeData.onBindCodeArtifact?.(id, value || undefined)
              }
              options={[
                { value: '', label: 'Unbound CodeSlot' },
                ...artifactOptions.map((artifact) => ({
                  value: artifact.id,
                  label: artifact.path,
                })),
              ]}
              className="min-w-0 flex-1"
            />
            <button
              type="button"
              className="nodrag nopan h-7 rounded border border-(--nodegraph-node-border) px-2 text-[10px] text-(--nodegraph-text) disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!nodeData.executor}
              onClick={() =>
                nodeData.executor &&
                nodeData.onOpenCodeSlotDefinition?.(nodeData.executor.slotId)
              }
            >
              Open
            </button>
          </div>
          <CodeMirror
            data-editor-native-history="true"
            value={nodeData.code ?? ''}
            onChange={(value) => nodeData.onChangeCode?.(id, value)}
            editable={Boolean(nodeData.executor && artifactId)}
            extensions={[
              languageExtension,
              completionExtension,
              codeMirrorTypographyTheme,
            ]}
            basicSetup={{
              lineNumbers: true,
              foldGutter: false,
              highlightActiveLine: false,
              autocompletion: true,
            }}
            className="nodrag nopan native-code-node__editor"
          />
        </div>
      )}
      {renderSource(
        id,
        'out.control.next',
        'control',
        resolveMultiplicity('source', 'control'),
        isCollapsed ? '65%' : undefined,
        nodeData.onPortContextMenu
      )}
    </div>
  );
};
