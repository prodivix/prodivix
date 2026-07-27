import { Plus, X } from 'lucide-react';
import {
  normalizeStatusCodes,
  renderSource,
  renderTarget,
  resolveMultiplicity,
  type GraphNodeData,
} from '@/editor/features/development/reactflow/graphNodeShared';
import {
  buildNodeContainerClass,
  NODE_ICON_BUTTON_CLASS,
  NODE_REMOVE_BUTTON_CLASS,
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
const STATUS_INPUT_CLASS =
  'nodrag nopan h-6 w-16 rounded border border-(--nodegraph-node-border) bg-(--nodegraph-node-soft-bg) px-2 text-[11px] font-normal text-(--nodegraph-text) outline-none focus:border-(--nodegraph-node-border-strong) focus:bg-(--nodegraph-node-bg)';

export const renderFetchGraphNode = ({ id, nodeData, selected, t }: Props) => {
  const statusCodes = normalizeStatusCodes(nodeData.statusCodes);
  const isCollapsed = Boolean(nodeData.collapsed);
  return (
    <div className={buildNodeContainerClass(selected, 'min-w-[240px]')}>
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
        actions={
          <button
            type="button"
            className={NODE_ICON_BUTTON_CLASS}
            onClick={(event) => {
              event.stopPropagation();
              nodeData.onAddStatusCode?.(id);
            }}
            aria-label={tNode(t, 'fetch.aria.addStatusCode', 'add status code')}
          >
            <Plus size={14} />
          </button>
        }
      />
      {isCollapsed ? (
        <>
          <div className="relative flex min-h-7 items-center px-4 pb-2 text-[11px] font-normal text-(--nodegraph-muted-text)">
            {renderTarget(
              id,
              'in.data.url',
              'data',
              resolveMultiplicity('target', 'data'),
              undefined,
              nodeData.onPortContextMenu
            )}
            <span>
              {nodeData.method || 'GET'} ·{' '}
              {tNode(t, 'fetch.statusCodeCount', '{{count}} codes', {
                count: statusCodes.length,
              })}
            </span>
          </div>
          {statusCodes.map((item) => (
            <div key={item.id}>
              {renderSource(
                id,
                `out.control.status-${item.id}`,
                'control',
                resolveMultiplicity('source', 'control'),
                undefined,
                nodeData.onPortContextMenu
              )}
            </div>
          ))}
          {renderSource(
            id,
            'out.control.error-request',
            'control',
            resolveMultiplicity('source', 'control'),
            undefined,
            nodeData.onPortContextMenu
          )}
          {renderSource(
            id,
            'out.control.error-unexpected',
            'control',
            resolveMultiplicity('source', 'control'),
            undefined,
            nodeData.onPortContextMenu
          )}
        </>
      ) : (
        <div className="pb-2">
          <div className="relative px-4 pb-1">
            <input
              className="nodrag nopan h-7 w-full rounded border border-(--nodegraph-node-border) bg-(--nodegraph-node-soft-bg) px-2 text-[11px] font-normal text-(--nodegraph-text) outline-none focus:border-(--nodegraph-node-border-strong) focus:bg-(--nodegraph-node-bg) disabled:cursor-not-allowed disabled:border-(--nodegraph-node-border) disabled:bg-(--nodegraph-node-soft-bg) disabled:text-(--nodegraph-subtle-text)"
              value={nodeData.value ?? ''}
              onChange={(event) =>
                nodeData.onChangeValue?.(id, event.target.value)
              }
              placeholder={
                nodeData.hasUrlInput
                  ? tNode(
                      t,
                      'fetch.urlInput.fromConnection',
                      'URL comes from connected data input'
                    )
                  : tNode(
                      t,
                      'fetch.urlInput.placeholder',
                      'https://api.example.com/orders'
                    )
              }
              disabled={Boolean(nodeData.hasUrlInput)}
              spellCheck={false}
            />
            {renderTarget(
              id,
              'in.data.url',
              'data',
              resolveMultiplicity('target', 'data'),
              undefined,
              nodeData.onPortContextMenu
            )}
          </div>
          <div className="px-4 pb-1">
            <SelectField
              className="w-full"
              value={nodeData.method || 'GET'}
              onChange={(value) => nodeData.onChangeMethod?.(id, value)}
              options={[
                { value: 'GET', label: 'GET' },
                { value: 'POST', label: 'POST' },
                { value: 'PUT', label: 'PUT' },
                { value: 'PATCH', label: 'PATCH' },
                { value: 'DELETE', label: 'DELETE' },
              ]}
            />
          </div>
          {statusCodes.map((item) => (
            <div
              key={item.id}
              className="group relative flex min-h-7 items-center gap-2 px-4 text-[11px] font-normal text-(--nodegraph-text)"
            >
              <input
                className={STATUS_INPUT_CLASS}
                value={item.code}
                onChange={(event) =>
                  nodeData.onChangeStatusCode?.(id, item.id, event.target.value)
                }
                placeholder="200"
                spellCheck={false}
              />
              {renderSource(
                id,
                `out.control.status-${item.id}`,
                'control',
                resolveMultiplicity('source', 'control'),
                undefined,
                nodeData.onPortContextMenu
              )}
              <button
                type="button"
                className={`ml-auto ${NODE_REMOVE_BUTTON_CLASS}`}
                onClick={(event) => {
                  event.stopPropagation();
                  nodeData.onRemoveStatusCode?.(id, item.id);
                }}
                aria-label={tNode(
                  t,
                  'fetch.aria.removeStatusCode',
                  'remove status code'
                )}
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <div className="relative flex min-h-7 items-center px-4 text-[11px] font-normal text-(--nodegraph-text)">
            <span>{tNode(t, 'fetch.rows.requestError', 'request error')}</span>
            {renderSource(
              id,
              'out.control.error-request',
              'control',
              resolveMultiplicity('source', 'control'),
              undefined,
              nodeData.onPortContextMenu
            )}
          </div>
          <div className="relative flex min-h-7 items-center px-4 text-[11px] font-normal text-(--nodegraph-text)">
            <span>
              {tNode(t, 'fetch.rows.unexpectedStatus', 'unexpected status')}
            </span>
            {renderSource(
              id,
              'out.control.error-unexpected',
              'control',
              resolveMultiplicity('source', 'control'),
              undefined,
              nodeData.onPortContextMenu
            )}
          </div>
        </div>
      )}
    </div>
  );
};
