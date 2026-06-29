import type { KeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  COMPACT_PREVIEW_SCALE,
  getDefaultSizeId,
  getDefaultStatusIndex,
  getPreviewScale,
  isWideComponent,
} from '@/editor/features/design/blueprint/editor/model/data';
import type { ComponentGroup } from '@/editor/features/design/blueprint/editor/model/types';
import {
  DraggablePreviewCard,
  DraggableVariantCard,
} from './SidebarDraggableCards';
import { SidebarPreviewFrame } from './SidebarPreviewFrame';

type SidebarComponentListProps = {
  groups: ComponentGroup[];
  collapsedGroups: Record<string, boolean>;
  expandedPreviews: Record<string, boolean>;
  sizeSelections: Record<string, string>;
  statusSelections: Record<string, number>;
  translate: (key: string, options?: Record<string, unknown>) => string;
  onToggleGroup: (groupId: string, collapsed: boolean) => void;
  onTogglePreview: (previewId: string) => void;
  onPreviewKeyDown: (
    event: KeyboardEvent<HTMLDivElement>,
    previewId: string,
    hasVariants: boolean
  ) => void;
  onAddComponent: (itemId: string) => void;
  onSizeSelect: (itemId: string, sizeId: string) => void;
  onStatusSelect: (itemId: string, index: number) => void;
  onStatusCycleStart: (itemId: string, total: number) => void;
  onStatusCycleStop: (itemId: string) => void;
};

export function SidebarComponentList({
  groups,
  collapsedGroups,
  expandedPreviews,
  sizeSelections,
  statusSelections,
  translate,
  onToggleGroup,
  onTogglePreview,
  onPreviewKeyDown,
  onAddComponent,
  onSizeSelect,
  onStatusSelect,
  onStatusCycleStart,
  onStatusCycleStop,
}: SidebarComponentListProps) {
  return (
    <div className="BlueprintEditorComponentList grid overflow-auto px-3 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar]:w-0">
      {groups.map((group, groupIndex) => {
        const isGroupCollapsed = collapsedGroups[group.id] ?? groupIndex > 0;
        const groupTitle = translate(
          `componentLibrary.groups.${group.id}.title`,
          {
            defaultValue: group.title,
          }
        );
        return (
          <div
            key={group.id}
            className={`ComponentGroup grid ${isGroupCollapsed ? '' : 'pb-4'}`}
          >
            <div className="ComponentGroupHeaderSurface sticky top-0 z-[2] bg-(--bg-canvas) py-2 backdrop-blur-[6px]">
              <button
                className="ComponentGroupHeader flex h-7 w-full cursor-pointer items-center justify-between border-0 bg-transparent p-0"
                onClick={() => onToggleGroup(group.id, isGroupCollapsed)}
              >
                <span className="ComponentGroupTitle text-[11px] tracking-[0.06em] text-(--text-muted) uppercase">
                  {groupTitle} ({group.items.length})
                </span>
                <ChevronDown
                  size={14}
                  className={`ComponentGroupIcon text-(--text-muted) transition-transform ${isGroupCollapsed ? '-rotate-90' : ''}`}
                />
              </button>
            </div>
            {!isGroupCollapsed && (
              <div className="ComponentGroupItems grid [grid-auto-flow:dense] grid-cols-2 gap-3">
                {group.items.map((item) => {
                  const variants = item.variants ?? [];
                  const hasVariants = variants.length > 0;
                  const isExpanded = expandedPreviews[item.id];
                  const isWide = isWideComponent(group, item);
                  const itemName = translate(
                    `componentLibrary.items.${item.id}.name`,
                    { defaultValue: item.name }
                  );
                  const sizeOptions = item.sizeOptions;
                  const statusOptions = item.statusOptions;
                  const selectedSizeId = sizeOptions
                    ? (sizeSelections[item.id] ?? getDefaultSizeId(sizeOptions))
                    : undefined;
                  const selectedSizeValue = sizeOptions?.find(
                    (option) => option.id === selectedSizeId
                  )?.value;
                  const statusCount = statusOptions?.length ?? 0;
                  const statusIndex = statusCount
                    ? (statusSelections[item.id] ??
                        getDefaultStatusIndex(
                          statusOptions,
                          item.defaultStatus
                        )) % statusCount
                    : 0;
                  const statusValue = statusOptions?.[statusIndex]?.value;
                  const previewNode = item.renderPreview
                    ? item.renderPreview({
                        size: selectedSizeValue,
                        status: statusValue,
                      })
                    : item.preview;
                  const previewScale = getPreviewScale(item.scale, isWide);
                  const showControls = Boolean(
                    sizeOptions?.length || statusCount
                  );
                  return (
                    <div
                      key={item.id}
                      className={`ComponentPreview grid gap-1.5 ${isExpanded ? 'Expanded col-[1/-1]' : ''} ${isWide ? 'Wide col-[1/-1]' : ''}`}
                    >
                      <div
                        className={`ComponentPreviewCard relative grid min-h-[94px] cursor-pointer gap-1.5 rounded-lg border border-transparent bg-transparent px-1.5 pt-1.5 pb-[18px] transition-[border-color,background,opacity] select-none ${hasVariants ? 'HasVariants hover:border-(--border-subtle) hover:bg-(--bg-panel)' : ''}`}
                        onClick={() => hasVariants && onTogglePreview(item.id)}
                        aria-expanded={hasVariants ? isExpanded : undefined}
                        role={hasVariants ? 'button' : undefined}
                        tabIndex={hasVariants ? 0 : undefined}
                        onKeyDown={(event) => {
                          if (!hasVariants) return;
                          if (event.key !== 'Enter' && event.key !== ' ')
                            return;
                          event.preventDefault();
                          onTogglePreview(item.id);
                        }}
                      >
                        <DraggablePreviewCard
                          itemId={item.id}
                          selectedSize={selectedSizeValue}
                          className="ComponentPreviewBox relative grid min-h-[94px] cursor-grab gap-1.5 rounded-lg bg-transparent px-1.5 pt-1.5 select-none"
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                          }}
                          onDoubleClick={() => onAddComponent(item.id)}
                          onKeyDown={(event) =>
                            onPreviewKeyDown(event, item.id, hasVariants)
                          }
                          onMouseEnter={() => {
                            if (statusCount) {
                              onStatusCycleStart(item.id, statusCount);
                            }
                          }}
                          onMouseLeave={() => {
                            if (statusCount) {
                              onStatusCycleStop(item.id);
                            }
                          }}
                        >
                          <SidebarPreviewFrame
                            scale={previewScale}
                            wide={isWide}
                          >
                            {previewNode}
                          </SidebarPreviewFrame>
                          <span className="ComponentPreviewLabel text-center text-[10px] text-(--text-muted)">
                            {itemName}
                          </span>
                          {showControls && (
                            <div className="ComponentPreviewMeta flex items-center justify-between gap-1.5">
                              {sizeOptions && (
                                <div className="ComponentPreviewSizes inline-flex gap-1">
                                  {sizeOptions.map((option) => (
                                    <button
                                      key={option.id}
                                      type="button"
                                      className={`ComponentPreviewSize cursor-pointer rounded border border-(--border-default) bg-transparent px-1 text-[9px] leading-[14px] text-(--text-muted) ${selectedSizeId === option.id ? 'Active border-(--border-strong) bg-(--bg-panel) text-(--text-primary)' : ''}`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        onSizeSelect(item.id, option.id);
                                      }}
                                      onPointerDown={(event) =>
                                        event.stopPropagation()
                                      }
                                    >
                                      {option.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {statusCount > 0 && (
                                <div className="ComponentPreviewStatus ml-auto inline-flex gap-1">
                                  {statusOptions?.map((option, index) => (
                                    <button
                                      key={option.id}
                                      type="button"
                                      className={`ComponentPreviewStatusDot h-1.5 w-1.5 cursor-pointer rounded-full border border-(--border-default) bg-transparent p-0 ${index === statusIndex ? 'Active border-(--text-secondary) bg-(--text-secondary)' : ''}`}
                                      title={option.label}
                                      aria-label={option.label}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        onStatusCycleStop(item.id);
                                        onStatusSelect(item.id, index);
                                      }}
                                      onPointerDown={(event) =>
                                        event.stopPropagation()
                                      }
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </DraggablePreviewCard>
                        {hasVariants && (
                          <span
                            className="absolute right-2 bottom-0 inline-flex items-center gap-1 rounded-full border border-(--border-default) bg-(--bg-raised) px-1.5 py-[1px] text-[9px] tracking-[0.02em] text-(--text-muted)"
                            aria-hidden="true"
                          >
                            <span>{variants.length}</span>
                            <ChevronDown
                              size={10}
                              className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            />
                          </span>
                        )}
                      </div>
                      {hasVariants && isExpanded && (
                        <div
                          className={`ComponentPreviewVariants grid [grid-template-columns:repeat(auto-fit,minmax(80px,1fr))] gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-panel) p-2 ${isWide ? 'Wide [grid-template-columns:1fr]' : ''}`}
                        >
                          {variants.map((variant) => {
                            const variantScale = getPreviewScale(
                              variant.scale ??
                                item.scale ??
                                COMPACT_PREVIEW_SCALE,
                              isWide
                            );
                            const variantNode = variant.renderElement
                              ? variant.renderElement({
                                  size: selectedSizeValue,
                                })
                              : variant.element;
                            return (
                              <DraggableVariantCard
                                key={`${item.id}-${variant.id}`}
                                itemId={item.id}
                                variantId={variant.id}
                                variantProps={variant.props}
                                selectedSize={selectedSizeValue}
                                className={`ComponentVariantCard grid gap-1 text-center ${isWide ? 'Wide col-[1/-1]' : ''}`}
                              >
                                <SidebarPreviewFrame
                                  scale={variantScale}
                                  wide={isWide}
                                  className="Small h-12"
                                >
                                  {variantNode}
                                </SidebarPreviewFrame>
                                <span className="ComponentVariantLabel text-[9px] text-(--text-muted)">
                                  {variant.label}
                                </span>
                              </DraggableVariantCard>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
