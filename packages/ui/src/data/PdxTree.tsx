import './PdxTree.scss';
import { type PdxComponent } from '@prodivix/shared';
import { getDataAttributes } from '../foundation/component';
import { ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';

export interface PdxTreeNode {
  id: string;
  label: string;
  children?: PdxTreeNode[];
  disabled?: boolean;
}

interface PdxTreeSpecificProps {
  data: PdxTreeNode[];
  expandedKeys?: string[];
  defaultExpandedKeys?: string[];
  selectedKey?: string;
  onToggle?: (keys: string[]) => void;
  onSelect?: (node: PdxTreeNode) => void;
}

export interface PdxTreeProps extends PdxComponent, PdxTreeSpecificProps {}

/** One row as the keyboard sees it: the flattened, currently visible order. */
type VisibleRow = {
  node: PdxTreeNode;
  depth: number;
  parentId: string | undefined;
  hasChildren: boolean;
  expanded: boolean;
};

const flattenVisible = (
  nodes: PdxTreeNode[],
  expandedSet: ReadonlySet<string>,
  depth = 0,
  parentId?: string,
  rows: VisibleRow[] = []
): VisibleRow[] => {
  for (const node of nodes) {
    const hasChildren = Boolean(node.children?.length);
    const expanded = hasChildren && expandedSet.has(node.id);
    rows.push({ node, depth, parentId, hasChildren, expanded });
    if (expanded) {
      flattenVisible(
        node.children ?? [],
        expandedSet,
        depth + 1,
        node.id,
        rows
      );
    }
  }
  return rows;
};

/**
 * A `tree` owns `treeitem` children and each `treeitem` owns its own `group`,
 * so the expand affordance cannot be a button: `button` is not an allowed child
 * role of `tree`, and `aria-expanded` belongs on the item itself. Rows are
 * reached with the arrow keys through a roving tabindex, which the tree pattern
 * requires and which a sibling toggle button silently replaced with tab stops.
 */
function PdxTree({
  data,
  expandedKeys,
  defaultExpandedKeys,
  selectedKey,
  onToggle,
  onSelect,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxTreeProps) {
  const [internalExpanded, setInternalExpanded] = useState<string[]>(
    defaultExpandedKeys || []
  );
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const treeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (expandedKeys) {
      setInternalExpanded(expandedKeys);
    }
  }, [expandedKeys]);

  const currentExpanded = expandedKeys ?? internalExpanded;
  const expandedSet = useMemo(
    () => new Set(currentExpanded),
    [currentExpanded]
  );

  const visibleRows = useMemo(
    () => flattenVisible(data, expandedSet),
    [data, expandedSet]
  );

  const setExpanded = useCallback(
    (nextExpanded: string[]) => {
      if (expandedKeys === undefined) {
        setInternalExpanded(nextExpanded);
      }
      onToggle?.(nextExpanded);
    },
    [expandedKeys, onToggle]
  );

  const toggleNode = useCallback(
    (nodeId: string) => {
      setExpanded(
        expandedSet.has(nodeId)
          ? currentExpanded.filter((key) => key !== nodeId)
          : [...currentExpanded, nodeId]
      );
    },
    [currentExpanded, expandedSet, setExpanded]
  );

  const handleSelect = useCallback(
    (node: PdxTreeNode) => {
      if (node.disabled) return;
      onSelect?.(node);
    },
    [onSelect]
  );

  // Exactly one row is tabbable so Tab enters and leaves the tree as a unit:
  // the caller's selection when it is visible, otherwise the first row.
  const tabbableId =
    activeId && visibleRows.some((row) => row.node.id === activeId)
      ? activeId
      : selectedKey && visibleRows.some((row) => row.node.id === selectedKey)
        ? selectedKey
        : visibleRows[0]?.node.id;

  const focusRow = useCallback((nodeId: string) => {
    setActiveId(nodeId);
    treeRef.current
      ?.querySelector<HTMLElement>(
        `[data-pdx-tree-item="${CSS.escape(nodeId)}"]`
      )
      ?.focus();
  }, []);

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    row: VisibleRow
  ) => {
    const index = visibleRows.findIndex(
      (candidate) => candidate.node.id === row.node.id
    );
    if (index < 0) return;

    switch (event.key) {
      case 'ArrowDown': {
        const next = visibleRows[index + 1];
        if (next) {
          event.preventDefault();
          focusRow(next.node.id);
        }
        return;
      }
      case 'ArrowUp': {
        const previous = visibleRows[index - 1];
        if (previous) {
          event.preventDefault();
          focusRow(previous.node.id);
        }
        return;
      }
      case 'ArrowRight': {
        if (!row.hasChildren) return;
        event.preventDefault();
        if (!row.expanded) {
          toggleNode(row.node.id);
          return;
        }
        const firstChild = visibleRows[index + 1];
        if (firstChild) focusRow(firstChild.node.id);
        return;
      }
      case 'ArrowLeft': {
        event.preventDefault();
        if (row.expanded) {
          toggleNode(row.node.id);
          return;
        }
        if (row.parentId) focusRow(row.parentId);
        return;
      }
      case 'Home': {
        const first = visibleRows[0];
        if (first) {
          event.preventDefault();
          focusRow(first.node.id);
        }
        return;
      }
      case 'End': {
        const last = visibleRows.at(-1);
        if (last) {
          event.preventDefault();
          focusRow(last.node.id);
        }
        return;
      }
      case 'Enter':
      case ' ': {
        event.preventDefault();
        handleSelect(row.node);
        return;
      }
      default:
    }
  };

  const renderNodes = (nodes: PdxTreeNode[], depth: number) =>
    nodes.map((node, index) => {
      const hasChildren = Boolean(node.children?.length);
      const isExpanded = hasChildren && expandedSet.has(node.id);
      const isSelected = selectedKey === node.id;
      const visible = visibleRows.find(
        (candidate) => candidate.node.id === node.id
      );
      const row: VisibleRow = visible ?? {
        node,
        depth,
        parentId: undefined,
        hasChildren,
        expanded: isExpanded,
      };

      return (
        <div
          key={node.id}
          aria-disabled={node.disabled || undefined}
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-level={depth + 1}
          aria-posinset={index + 1}
          aria-selected={isSelected}
          aria-setsize={nodes.length}
          className={`PdxTreeItem ${isSelected ? 'Selected' : ''} ${node.disabled ? 'Disabled' : ''}`.trim()}
          data-pdx-tree-item={node.id}
          onClick={(event) => {
            event.stopPropagation();
            setActiveId(node.id);
            handleSelect(node);
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            handleKeyDown(event, row);
          }}
          role="treeitem"
          tabIndex={tabbableId === node.id ? 0 : -1}
        >
          <div className="PdxTreeRow" style={{ paddingLeft: depth * 16 }}>
            {hasChildren ? (
              <span
                aria-hidden="true"
                className={`PdxTreeChevron ${isExpanded ? 'Expanded' : ''}`.trim()}
                onClick={(event) => {
                  // Toggling must not also select; the row's own click does that.
                  event.stopPropagation();
                  setActiveId(node.id);
                  toggleNode(node.id);
                }}
              >
                <ChevronRight size={15} />
              </span>
            ) : (
              <span aria-hidden="true" className="PdxTreeSpacer" />
            )}
            <span className="PdxTreeLabel">{node.label}</span>
          </div>
          {hasChildren && isExpanded && (
            <div className="PdxTreeChildren" role="group">
              {renderNodes(node.children ?? [], depth + 1)}
            </div>
          )}
        </div>
      );
    });

  const fullClassName = `PdxTree ${className || ''}`.trim();
  const dataProps = getDataAttributes(dataAttributes);

  return (
    <div
      ref={treeRef}
      className={fullClassName}
      {...dataProps}
      id={id}
      role="tree"
      style={style as React.CSSProperties}
    >
      {renderNodes(data, 0)}
    </div>
  );
}

export default PdxTree;
