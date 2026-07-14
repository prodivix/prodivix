import { Sparkles } from 'lucide-react';
import { useInspectorContext } from '@/editor/features/blueprint/editor/inspector/InspectorContext';
import type { InspectorPanelDefinition } from './types';

function AnimationPanelHeaderActions() {
  const { t, openAnimationEditor, canOpenAnimationEditor } =
    useInspectorContext();

  return (
    <button
      type="button"
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-(--text-muted) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-40"
      onClick={openAnimationEditor}
      disabled={!canOpenAnimationEditor}
      aria-label={t('inspector.groups.animation.openEditor', {
        defaultValue: 'Open animation editor',
      })}
      title={t('inspector.groups.animation.openEditor', {
        defaultValue: 'Open animation editor',
      })}
      data-testid="inspector-animation-open-editor"
    >
      <Sparkles size={14} />
    </button>
  );
}

function AnimationPanelView() {
  const {
    t,
    hasAnimationDefinition,
    isAnimationMounted,
    mountedAnimationBindingCount,
    mountSelectedNodeToAnimation,
    unmountSelectedNodeFromAnimation,
    selectedNode,
    animationWriteAvailable,
    animationDiagnostic,
  } = useInspectorContext();

  return (
    <div className="flex flex-col gap-1.5 pt-1 pb-1">
      <span className="text-[10px] text-(--text-muted)">
        {selectedNode?.id ? (
          <>
            {t('inspector.groups.animation.selectedNode', {
              defaultValue: 'Current node',
            })}
            <span className="[font-family:var(--font-family-mono)] text-(--text-secondary)">
              {`: ${selectedNode.id}`}
            </span>
          </>
        ) : (
          t('inspector.groups.animation.noSelection', {
            defaultValue: 'Select a component to mount animation.',
          })
        )}
      </span>
      {!hasAnimationDefinition ? (
        <div className="text-[10px] text-(--text-muted)">
          {t('inspector.groups.animation.empty', {
            defaultValue:
              'No animation yet. Mounting will initialize the animation document.',
          })}
        </div>
      ) : null}
      {selectedNode?.id ? (
        <div className="flex items-center justify-between gap-2 py-1">
          <div className="text-[10px] text-(--text-muted)">
            {isAnimationMounted
              ? t('inspector.groups.animation.mounted', {
                  defaultValue: 'Mounted to animation',
                })
              : t('inspector.groups.animation.unmounted', {
                  defaultValue: 'Not mounted',
                })}
            {isAnimationMounted && mountedAnimationBindingCount > 1 ? (
              <span className="text-(--text-muted)">
                {t('inspector.groups.animation.bindingCount', {
                  defaultValue: `(${mountedAnimationBindingCount} bindings)`,
                  count: mountedAnimationBindingCount,
                })}
              </span>
            ) : null}
          </div>
          {isAnimationMounted ? (
            <button
              type="button"
              className="h-6 px-1.5 text-[10px] text-(--text-muted) hover:text-(--text-primary)"
              onClick={unmountSelectedNodeFromAnimation}
              disabled={!animationWriteAvailable}
            >
              {t('inspector.groups.animation.unmount', {
                defaultValue: 'Unmount',
              })}
            </button>
          ) : (
            <button
              type="button"
              className="h-6 px-1.5 text-[10px] text-(--text-secondary) hover:text-(--text-primary)"
              onClick={mountSelectedNodeToAnimation}
              disabled={!animationWriteAvailable}
            >
              {t('inspector.groups.animation.mount', {
                defaultValue: 'Mount',
              })}
            </button>
          )}
        </div>
      ) : null}
      {animationDiagnostic ? (
        <span className="text-[10px] text-(--text-muted)">
          {animationDiagnostic}
        </span>
      ) : null}
    </div>
  );
}

export const animationPanel: InspectorPanelDefinition = {
  key: 'animation-mount',
  title: 'Animation Mount',
  description: 'Animation mount/unmount controls',
  match: () => true,
  headerActions: <AnimationPanelHeaderActions />,
  render: () => <AnimationPanelView />,
};
