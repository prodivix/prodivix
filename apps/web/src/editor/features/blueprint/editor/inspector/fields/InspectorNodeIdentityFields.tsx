import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Type,
  WandSparkles,
} from 'lucide-react';
import { PdxInput, PdxRichTextEditor } from '@prodivix/ui';
import { useState } from 'react';
import { InspectorRow } from '@/editor/features/blueprint/editor/inspector/components/InspectorRow';
import { getTextFieldLabel } from '@/editor/features/blueprint/editor/controller/inspectorUtils';
import {
  getNodeTextFieldMode,
  updateNodeTextField,
  updateNodeTextFieldMode,
} from '@/editor/features/blueprint/editor/model/blueprintText';
import { useInspectorContext } from '@/editor/features/blueprint/editor/inspector/InspectorContext';

const INSPECTOR_ACTION_ICON_BUTTON_CLASS =
  'inline-flex h-5 w-4.5 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-(--text-muted) hover:text-(--text-primary)';

/**
 * 调用链路 / Call chain:
 * 1) BlueprintEditorInspector 通过 InspectorContext 提供 selectedNode、primaryTextField、updateSelectedNode。
 * 2) InspectorBasicTab 渲染本组件，作为「基础信息」中的文本编辑入口。
 * 3) 组件根据 getNodeTextFieldMode 在单行输入与富文本输入间切换。
 * 4) 更新统一走 updateNodeTextField / updateNodeTextFieldMode，最终写回同一份节点状态。
 */
export function InspectorNodeIdentityFields() {
  const {
    t,
    draftId,
    setDraftId,
    applyRename,
    selectedNode,
    isDirty,
    canApply,
    isDuplicate,
    primaryTextField,
    updateSelectedNode,
  } = useInspectorContext();
  const [isRichEditorCollapsed, setIsRichEditorCollapsed] = useState(false);

  return (
    <>
      <div className="InspectorField flex flex-col gap-1.5">
        <InspectorRow
          label={t('inspector.fields.id.label', {
            defaultValue: 'Component ID',
          })}
          control={
            <div className="InspectorInputRow group flex w-full items-center gap-1">
              <PdxInput
                size="Small"
                value={draftId}
                dataAttributes={{
                  'data-testid': 'inspector-id-input',
                }}
                onChange={(value) => setDraftId(value)}
                onBlur={applyRename}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    applyRename();
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setDraftId(selectedNode.id);
                  }
                }}
              />
              {isDirty && (
                <div className="InspectorFieldActions inline-flex items-center gap-1 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    className="InspectorFieldAction inline-flex items-center justify-center rounded-full border-0 bg-transparent px-1 py-0.5 text-(--text-muted) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-45"
                    onClick={applyRename}
                    disabled={!canApply}
                    aria-label={t('inspector.actions.apply', {
                      defaultValue: 'Apply',
                    })}
                    title={t('inspector.actions.apply', {
                      defaultValue: 'Apply',
                    })}
                  >
                    <Check size={14} />
                  </button>
                </div>
              )}
            </div>
          }
        />
        {isDuplicate && (
          <div
            className="InspectorWarning inline-flex items-center gap-1 text-[10px] text-(--danger-color)"
            role="alert"
          >
            <AlertTriangle size={12} />
            <span>
              {t('inspector.fields.id.duplicate', {
                defaultValue: 'ID already exists.',
              })}
            </span>
          </div>
        )}
      </div>
      {primaryTextField ? (
        <div className="InspectorField flex flex-col gap-1.5">
          <InspectorRow
            label={getTextFieldLabel(primaryTextField.key, t)}
            control={
              primaryTextField.key === 'text' &&
              getNodeTextFieldMode(selectedNode, 'text') === 'rich' ? (
                // 富文本框 + 俩按钮
                <div className="flex w-full flex-col gap-1.5">
                  <div className="inline-flex items-center justify-end gap-1">
                    <button
                      type="button"
                      className={INSPECTOR_ACTION_ICON_BUTTON_CLASS}
                      title={
                        isRichEditorCollapsed
                          ? t('inspector.panels.text.expandRich', {
                              defaultValue: 'Expand rich text editor',
                            })
                          : t('inspector.panels.text.collapseRich', {
                              defaultValue: 'Collapse rich text editor',
                            })
                      }
                      aria-label={
                        isRichEditorCollapsed
                          ? t('inspector.panels.text.expandRich', {
                              defaultValue: 'Expand rich text editor',
                            })
                          : t('inspector.panels.text.collapseRich', {
                              defaultValue: 'Collapse rich text editor',
                            })
                      }
                      onClick={() =>
                        setIsRichEditorCollapsed((current) => !current)
                      }
                      data-testid="inspector-text-rich-collapse-toggle"
                    >
                      {isRichEditorCollapsed ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronUp size={14} />
                      )}
                    </button>
                    <button
                      type="button"
                      className={INSPECTOR_ACTION_ICON_BUTTON_CLASS}
                      title={t('inspector.panels.text.switchToPlain', {
                        defaultValue: 'Switch to plain text input',
                      })}
                      aria-label={t('inspector.panels.text.switchToPlain', {
                        defaultValue: 'Switch to plain text input',
                      })}
                      onClick={() => {
                        updateSelectedNode((current) =>
                          updateNodeTextFieldMode(current, 'text', 'plain')
                        );
                      }}
                    >
                      <Type size={14} />
                    </button>
                  </div>
                  {isRichEditorCollapsed ? null : (
                    <PdxRichTextEditor
                      className="w-full"
                      value={primaryTextField.value}
                      onChange={(value) => {
                        updateSelectedNode((current) =>
                          updateNodeTextField(current, primaryTextField, value)
                        );
                      }}
                    />
                  )}
                </div>
              ) : (
                // 单行输入框 + 一个按钮
                <div className="InspectorInputRow InspectorSingleInput relative flex w-full items-center">
                  <PdxInput
                    size="Small"
                    className={
                      primaryTextField.key === 'text' ? 'pr-8' : undefined
                    }
                    value={primaryTextField.value}
                    onChange={(value) => {
                      updateSelectedNode((current) =>
                        updateNodeTextField(current, primaryTextField, value)
                      );
                    }}
                  />
                  {primaryTextField.key === 'text' ? (
                    <div className="absolute top-1/2 right-1 inline-flex -translate-y-1/2 items-center gap-1">
                      <button
                        type="button"
                        className={INSPECTOR_ACTION_ICON_BUTTON_CLASS}
                        title={t('inspector.panels.text.switchToRich', {
                          defaultValue:
                            'Switch to rich text editor (bold/italic/color/size)',
                        })}
                        aria-label={t('inspector.panels.text.switchToRich', {
                          defaultValue:
                            'Switch to rich text editor (bold/italic/color/size)',
                        })}
                        onClick={() => {
                          updateSelectedNode((current) =>
                            updateNodeTextFieldMode(current, 'text', 'rich')
                          );
                        }}
                      >
                        <WandSparkles size={14} />
                      </button>
                    </div>
                  ) : null}
                </div>
              )
            }
          />
        </div>
      ) : null}
    </>
  );
}
