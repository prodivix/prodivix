import { useState } from 'react';
import type { LayoutGroupDefinition, LayoutGroupRenderProps } from '../types';
import { getSpacingValue, updateSpacingValue } from '../layoutPanelHelpers';
import { SpacingControl, type ExpandedSpacingState } from './SpacingControl';

let persistedExpandedSpacingState: ExpandedSpacingState = {
  margin: false,
  padding: false,
};

const resetSpacingExpansionPersistence = () => {
  persistedExpandedSpacingState = { margin: false, padding: false };
};

function SpacingGroupView({ node, updateNode, t }: LayoutGroupRenderProps) {
  const marginValue = getSpacingValue(node, 'margin');
  const paddingValue = getSpacingValue(node, 'padding');
  const [expandedSpacing, setExpandedSpacing] = useState<ExpandedSpacingState>(
    () => ({
      ...persistedExpandedSpacingState,
    })
  );
  const toggleSpacingExpand = (key: keyof ExpandedSpacingState) => {
    setExpandedSpacing((current) => {
      const next = { ...current, [key]: !current[key] };
      persistedExpandedSpacingState = { ...next };
      return next;
    });
  };

  return (
    <>
      <SpacingControl
        keyName="margin"
        value={marginValue}
        expanded={expandedSpacing.margin}
        onToggleExpand={() => toggleSpacingExpand('margin')}
        t={t}
        onChange={(nextValue) =>
          updateNode((current) =>
            updateSpacingValue(current, 'margin', nextValue)
          )
        }
      />
      <SpacingControl
        keyName="padding"
        value={paddingValue}
        expanded={expandedSpacing.padding}
        onToggleExpand={() => toggleSpacingExpand('padding')}
        t={t}
        onChange={(nextValue) =>
          updateNode((current) =>
            updateSpacingValue(current, 'padding', nextValue)
          )
        }
      />
    </>
  );
}

export const spacingGroup: LayoutGroupDefinition = {
  key: 'spacing',
  title: 'Spacing',
  order: 10,
  render: (props) => <SpacingGroupView {...props} />,
};

export { resetSpacingExpansionPersistence };
