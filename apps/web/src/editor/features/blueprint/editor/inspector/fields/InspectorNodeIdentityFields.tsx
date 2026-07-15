import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Type,
  WandSparkles,
} from 'lucide-react';
import { PdxInput, PdxRichTextEditor } from '@prodivix/ui';
import { useEffect, useState } from 'react';
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
  const { t, selectedNode, primaryTextField, updateSelectedNode } =
    useInspectorContext();
  const selectedNodeId = selectedNode?.id ?? '';
  const [isRichEditorCollapsed, setIsRichEditorCollapsed] = useState(false);
  const [identityCopyState, setIdentityCopyState] = useState<
    'idle' | 'copied' | 'failed'
  >('idle');

  useEffect(() => setIdentityCopyState('idle'), [selectedNodeId]);
  useEffect(() => {
    if (identityCopyState === 'idle') return;
    const timeoutId = window.setTimeout(
      () => setIdentityCopyState('idle'),
      1600
    );
    return () => window.clearTimeout(timeoutId);
  }, [identityCopyState]);

  const copyNodeIdentity = async () => {
    try {
      if (!selectedNodeId) throw new Error('Node identity missing');
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard missing');
      await navigator.clipboard.writeText(selectedNodeId);
      setIdentityCopyState('copied');
    } catch {
      setIdentityCopyState('failed');
    }
  };

  const identityFeedback =
    identityCopyState === 'copied'
      ? t('inspector.fields.id.copied', {
          defaultValue: 'Node ID copied.',
        })
      : identityCopyState === 'failed'
        ? t('inspector.fields.id.copyFailed', {
            defaultValue: 'Copy failed. Select the value to copy it manually.',
          })
        : t('inspector.fields.id.description', {
            defaultValue:
              'System-generated stable identity. Renaming does not change it.',
          });

  if (!selectedNode) return null;

  return (
    <>
      <div className="InspectorField flex flex-col gap-1.5">
        <InspectorRow
          label={t('inspector.fields.id.label', {
            defaultValue: 'Node ID',
          })}
          control={
            <div className="InspectorInputRow relative flex w-full items-center">
              <PdxInput
                size="Small"
                className="pr-8 font-mono text-[11px]"
                value={selectedNodeId}
                readOnly
                aria-label={t('inspector.fields.id.label', {
                  defaultValue: 'Node ID',
                })}
                dataAttributes={{
                  'data-testid': 'inspector-id-input',
                }}
                onFocus={(event) => {
                  event.currentTarget.select();
                }}
              />
              <button
                type="button"
                className="absolute top-1/2 right-1 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md border-0 bg-transparent text-(--text-muted) hover:text-(--text-primary) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--border-strong)"
                onClick={() => void copyNodeIdentity()}
                aria-label={
                  identityCopyState === 'copied'
                    ? t('inspector.fields.id.copied', {
                        defaultValue: 'Node ID copied.',
                      })
                    : t('inspector.fields.id.copy', {
                        defaultValue: 'Copy node ID',
                      })
                }
                title={
                  identityCopyState === 'failed'
                    ? identityFeedback
                    : t('inspector.fields.id.copy', {
                        defaultValue: 'Copy node ID',
                      })
                }
                data-testid="inspector-id-copy"
              >
                {identityCopyState === 'copied' ? (
                  <Check size={14} aria-hidden="true" />
                ) : (
                  <Copy size={14} aria-hidden="true" />
                )}
              </button>
            </div>
          }
        />
        <div className="text-[10px] text-(--text-muted)" aria-live="polite">
          {identityFeedback}
        </div>
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
                    onValueChange={(value) => {
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
