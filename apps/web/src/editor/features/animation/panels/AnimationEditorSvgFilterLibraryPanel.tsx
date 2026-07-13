import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SvgFilterDefinition } from '@prodivix/animation';
import {
  SVG_TYPES,
  SVG_UNITS,
} from '@/editor/features/animation/animationEditorUi';

type AnimationEditorSvgFilterLibraryPanelProps = {
  svgFilters: SvgFilterDefinition[];
  canRemoveSvgFilter: boolean;
  onAddSvgFilter: () => void;
  onDeleteSvgFilter: (filterId: string) => void;
  onUpdateSvgFilterUnits: (
    filterId: string,
    units: NonNullable<SvgFilterDefinition['units']> | undefined
  ) => void;
  onAddSvgPrimitive: (filterId: string) => void;
  onDeleteSvgPrimitive: (filterId: string, primitiveId: string) => void;
  onUpdateSvgPrimitiveType: (
    filterId: string,
    primitiveId: string,
    type: SvgFilterDefinition['primitives'][number]['type']
  ) => void;
};

export const AnimationEditorSvgFilterLibraryPanel = ({
  svgFilters,
  canRemoveSvgFilter,
  onAddSvgFilter,
  onDeleteSvgFilter,
  onUpdateSvgFilterUnits,
  onAddSvgPrimitive,
  onDeleteSvgPrimitive,
  onUpdateSvgPrimitiveType,
}: AnimationEditorSvgFilterLibraryPanelProps) => {
  const { t } = useTranslation('editor');

  return (
    <aside className="w-[340px] shrink-0 rounded-2xl border border-black/8 bg-(--bg-canvas) p-4 max-[1280px]:w-full">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium">
          {t('animationEditor.svgFilters.title')}
        </h2>
        <button
          type="button"
          onClick={onAddSvgFilter}
          className="inline-flex items-center gap-1 rounded border border-black/15 px-2 py-1 text-xs"
          aria-label={t('animationEditor.svgFilters.add')}
          title={t('animationEditor.svgFilters.add')}
        >
          <Plus size={12} />
          {t('animationEditor.svgFilters.add')}
        </button>
      </div>

      <div className="max-h-[70vh] space-y-2 overflow-auto pr-1">
        {svgFilters.map((filter) => (
          <article
            key={filter.id}
            className="rounded-lg border border-black/10 bg-black/[0.015] p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-medium">{filter.id}</p>
              <button
                type="button"
                onClick={() => onDeleteSvgFilter(filter.id)}
                disabled={!canRemoveSvgFilter}
                className="rounded border border-black/15 px-1.5 py-0.5 text-[11px] disabled:opacity-50"
                aria-label={t('animationEditor.common.delete')}
                title={t('animationEditor.common.delete')}
              >
                {t('animationEditor.common.delete')}
              </button>
            </div>

            <select
              value={filter.units ?? ''}
              onChange={(event) =>
                onUpdateSvgFilterUnits(
                  filter.id,
                  event.target.value
                    ? (event.target.value as NonNullable<
                        SvgFilterDefinition['units']
                      >)
                    : undefined
                )
              }
              className="mt-2 w-full rounded border border-black/15 px-2 py-1 text-xs"
              title={t('animationEditor.svgFilters.units')}
              aria-label={t('animationEditor.svgFilters.units')}
            >
              <option value="">
                {t('animationEditor.svgFilters.unitsDefault')}
              </option>
              {SVG_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {t('animationEditor.svgFilters.unitsValue', { unit })}
                </option>
              ))}
            </select>

            <div className="mt-2 space-y-2">
              {filter.primitives.map((primitive) => (
                <div
                  key={primitive.id}
                  className="rounded border border-black/10 bg-white p-2"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="truncate text-[11px]">{primitive.id}</p>
                    <button
                      type="button"
                      onClick={() =>
                        onDeleteSvgPrimitive(filter.id, primitive.id)
                      }
                      disabled={filter.primitives.length <= 1}
                      className="rounded border border-black/15 px-1.5 py-0.5 text-[10px] disabled:opacity-50"
                      aria-label={t('animationEditor.common.remove')}
                      title={t('animationEditor.common.remove')}
                    >
                      {t('animationEditor.common.remove')}
                    </button>
                  </div>
                  <select
                    value={primitive.type}
                    onChange={(event) =>
                      onUpdateSvgPrimitiveType(
                        filter.id,
                        primitive.id,
                        event.target.value as (typeof SVG_TYPES)[number]
                      )
                    }
                    className="w-full rounded border border-black/15 px-2 py-1 text-xs"
                    title={t('animationEditor.svgFilters.primitiveType')}
                    aria-label={t('animationEditor.svgFilters.primitiveType')}
                  >
                    {SVG_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <button
                type="button"
                onClick={() => onAddSvgPrimitive(filter.id)}
                className="inline-flex items-center gap-1 rounded border border-black/15 px-2 py-1 text-[11px]"
                aria-label={t('animationEditor.svgFilters.addPrimitive')}
                title={t('animationEditor.svgFilters.addPrimitive')}
              >
                <Plus size={10} />
                {t('animationEditor.svgFilters.addPrimitive')}
              </button>
            </div>
          </article>
        ))}
        {svgFilters.length === 0 ? (
          <div className="rounded border border-dashed border-black/15 px-3 py-6 text-center text-sm text-(--text-muted)">
            {t('animationEditor.svgFilters.empty')}
          </div>
        ) : null}
      </div>
    </aside>
  );
};
