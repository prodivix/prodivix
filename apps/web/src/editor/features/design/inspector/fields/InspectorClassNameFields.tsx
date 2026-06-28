import { InspectorRow } from '@/editor/features/design/inspector/components/InspectorRow';
import { ClassProtocolEditor } from '@/editor/features/design/inspector/components/classProtocol/ClassProtocolEditor';
import { useInspectorContext } from '@/editor/features/design/inspector/InspectorContext';
import { setNodeProp } from '@/editor/features/design/inspector/inspectorNodeProps';

export function InspectorClassNameFields() {
  const {
    t,
    projectId,
    supportsClassProtocol,
    classNameValue,
    mountedCssEntries,
    openMountedCssEditor,
    updateSelectedNode,
  } = useInspectorContext();

  if (!supportsClassProtocol) return null;

  return (
    <div className="InspectorField flex flex-col gap-1.5">
      <InspectorRow
        label={t('inspector.fields.className.label', {
          defaultValue: 'Class Name',
        })}
        control={
          <ClassProtocolEditor
            projectId={projectId}
            value={classNameValue}
            placeholder={t('inspector.fields.className.placeholder', {
              defaultValue: 'e.g. p-4 flex items-center',
            })}
            inputTestId="inspector-classname-input"
            mountedCssEntries={mountedCssEntries}
            onOpenMountedCss={(target) => {
              openMountedCssEditor(target);
            }}
            onChange={(value) => {
              updateSelectedNode((current) =>
                setNodeProp(current, 'className', value.trim())
              );
            }}
          />
        }
      />
    </div>
  );
}
