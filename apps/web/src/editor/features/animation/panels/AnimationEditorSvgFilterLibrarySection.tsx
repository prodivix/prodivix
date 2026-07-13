import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SvgFilterDefinition } from '@prodivix/animation';
import {
  SVG_TYPES,
  SVG_UNITS,
} from '@/editor/features/animation/animationEditorUi';

type AnimationEditorSvgFilterLibrarySectionProps = {
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

export const AnimationEditorSvgFilterLibrarySection = ({
  svgFilters,
  canRemoveSvgFilter,
  onAddSvgFilter,
  onDeleteSvgFilter,
  onUpdateSvgFilterUnits,
  onAddSvgPrimitive,
  onDeleteSvgPrimitive,
  onUpdateSvgPrimitiveType,
}: AnimationEditorSvgFilterLibrarySectionProps) => {
  const { t } = useTranslation('editor');
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium tracking-[0.08em] text-(--text-secondary)">
          {t('animationEditor.svgFilters.title')}
        </h3>
        <button
          type="button"
          onClick={onAddSvgFilter}
          className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-2.5 py-1 text-[11px] text-(--text-secondary) hover:bg-black/[0.03]"
          aria-label={t('animationEditor.svgFilters.add')}
          title={t('animationEditor.svgFilters.add')}
        >
          <Plus size={12} />
          {t('animationEditor.svgFilters.add')}
        </button>
      </div>

      {svgFilters.length === 0 ? (
        <div className="rounded-xl bg-black/[0.03] p-3 text-xs text-(--text-muted)">
          {t('animationEditor.svgFilters.empty')}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {svgFilters.map((filter) => (
            <div key={filter.id} className="rounded-xl bg-black/[0.03] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-xs font-medium text-(--text-primary)">
                  {filter.id}
                </p>
                <button
                  type="button"
                  onClick={() => onDeleteSvgFilter(filter.id)}
                  disabled={!canRemoveSvgFilter}
                  className="rounded-full border border-black/10 bg-white px-2 py-1 text-[10px] text-(--text-secondary) disabled:opacity-50"
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
                className="mt-2 w-full rounded-lg border border-black/10 bg-white px-2 py-1 text-xs text-(--text-secondary) outline-none"
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
                  <div key={primitive.id} className="rounded-lg bg-white p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-[11px] text-(--text-secondary)">
                        {primitive.id}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          onDeleteSvgPrimitive(filter.id, primitive.id)
                        }
                        disabled={filter.primitives.length <= 1}
                        className="rounded-full border border-black/10 px-2 py-0.5 text-[10px] text-(--text-secondary) disabled:opacity-50"
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
                      className="mt-1 w-full rounded-lg border border-black/10 bg-white px-2 py-1 text-xs text-(--text-secondary) outline-none"
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
                  className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-2.5 py-1 text-[11px] text-(--text-secondary) hover:bg-black/[0.03]"
                >
                  <Plus size={11} />
                  {t('animationEditor.svgFilters.addPrimitive')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
