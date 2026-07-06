import { Code } from 'lucide-react';
import { InspectorClassNameFields } from '@/editor/features/blueprint/editor/inspector/fields/InspectorClassNameFields';
import { useInspectorContext } from '@/editor/features/blueprint/editor/inspector/InspectorContext';
import type { InspectorPanelDefinition } from './types';
import { supportsClassNamePanel } from './panelCapabilities';

function ClassNamePanelHeaderActions() {
  const { t, openMountedCssEditor, mountedCssEntries } = useInspectorContext();

  return (
    <button
      type="button"
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-(--text-muted) hover:text-(--text-primary)"
      onClick={() => openMountedCssEditor()}
      aria-label={t('inspector.groups.style.openMountedCss', {
        defaultValue: 'Open mounted CSS',
      })}
      title={
        mountedCssEntries[0]?.path
          ? `${t('inspector.groups.style.openMountedCss', { defaultValue: 'Open mounted CSS' })}: ${mountedCssEntries[0].path}`
          : t('inspector.groups.style.attachMountedCss', {
              defaultValue: 'Attach mounted CSS',
            })
      }
      data-testid="inspector-style-open-mounted-css"
    >
      <Code size={14} />
    </button>
  );
}

function ClassNamePanelView() {
  return <InspectorClassNameFields />;
}

export const classNamePanel: InspectorPanelDefinition = {
  key: 'class-name',
  title: 'Class Name',
  description: 'Class protocol and mounted CSS entry point',
  match: supportsClassNamePanel,
  headerActions: <ClassNamePanelHeaderActions />,
  render: () => <ClassNamePanelView />,
};
