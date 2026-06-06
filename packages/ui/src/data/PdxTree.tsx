import './PdxTree.scss';
import { type PdxComponent } from '@prodivix/shared';
import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { Minus, Plus } from 'lucide-react';

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

  useEffect(() => {
    if (expandedKeys) {
      setInternalExpanded(expandedKeys);
    }
  }, [expandedKeys]);

  const currentExpanded = expandedKeys || internalExpanded;
  const expandedSet = useMemo(
    () => new Set(currentExpanded),
    [currentExpanded]
  );

  const toggleNode = (nodeId: string) => {
    const nextExpanded = expandedSet.has(nodeId)
      ? currentExpanded.filter((key) => key !== nodeId)
      : [...currentExpanded, nodeId];

    if (!expandedKeys) {
      setInternalExpanded(nextExpanded);
    }
    if (onToggle) {
      onToggle(nextExpanded);
    }
  };

  const handleSelect = (node: PdxTreeNode) => {
    if (node.disabled) return;
    if (onSelect) {
      onSelect(node);
    }
  };

  const renderNodes = (nodes: PdxTreeNode[], depth: number) => {
    return nodes.map((node) => {
      const hasChildren = !!node.children?.length;
      const isExpanded = expandedSet.has(node.id);
      return (
        <div key={node.id} className="PdxTreeNode">
          <div className="PdxTreeRow" style={{ paddingLeft: depth * 16 }}>
            {hasChildren ? (
              <button
                type="button"
                className="PdxTreeToggle"
                onClick={() => toggleNode(node.id)}
              >
                {isExpanded ? <Minus size={14} /> : <Plus size={14} />}
              </button>
            ) : (
              <span className="PdxTreeSpacer" />
            )}
            <button
              type="button"
              className={`PdxTreeLabel ${selectedKey === node.id ? 'Selected' : ''} ${node.disabled ? 'Disabled' : ''}`}
              onClick={() => handleSelect(node)}
            >
              {node.label}
            </button>
          </div>
          {hasChildren && isExpanded && (
            <div className="PdxTreeChildren">
              {renderNodes(node.children || [], depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  const fullClassName = `PdxTree ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  return (
    <div
      className={fullClassName}
      style={style as React.CSSProperties}
      id={id}
      {...dataProps}
    >
      {renderNodes(data, 0)}
    </div>
  );
}

export default PdxTree;
