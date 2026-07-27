export type ContextMenuState =
  | null
  | { kind: 'canvas'; x: number; y: number; flowX: number; flowY: number }
  | {
      kind: 'node';
      x: number;
      y: number;
      nodeId: string;
      flowX: number;
      flowY: number;
    }
  | {
      kind: 'port';
      x: number;
      y: number;
      nodeId: string;
      handleId: string;
      role: 'source' | 'target';
    };

export type ContextMenuItem = {
  id: string;
  label: string;
  icon?: string;
  onSelect?: () => void;
  children?: ContextMenuItem[];
  tone?: 'default' | 'danger';
};

/**
 * Separates an idempotent Workspace write from a refused one. A canvas that
 * already matches its document produces no command, which is a success for
 * callers gating on "the canvas is safe to leave".
 */
export type NodeGraphWorkspaceWriteOutcome =
  'applied' | 'unchanged' | 'rejected';

export type NodeValidationText = {
  playAnimationRequired: string;
  scrollToSelectorRequired: string;
  focusControlSelectorRequired: string;
  validateSchemaOrRulesRequired: string;
  envVarKeyRequired: string;
};
