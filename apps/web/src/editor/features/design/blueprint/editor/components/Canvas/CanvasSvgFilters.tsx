import { createElement } from 'react';
import type { SvgFilterDefinition } from '@prodivix/shared/types/pir';

const renderSvgPrimitive = (
  primitive: SvgFilterDefinition['primitives'][number]
) => {
  const props: Record<string, unknown> = { key: primitive.id };
  if (primitive.in) props['in'] = primitive.in;
  if (primitive.in2) props.in2 = primitive.in2;
  if (primitive.result) props.result = primitive.result;
  if (primitive.attrs) {
    Object.entries(primitive.attrs).forEach(([key, value]) => {
      props[key] = value;
    });
  }
  return createElement(primitive.type, props);
};

type CanvasSvgFiltersProps = {
  filters: SvgFilterDefinition[];
};

export function CanvasSvgFilters({ filters }: CanvasSvgFiltersProps) {
  if (!filters.length) return null;

  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
      className="absolute"
    >
      <defs>
        {filters.map((filter) => (
          <filter key={filter.id} id={filter.id} filterUnits={filter.units}>
            {filter.primitives.map(renderSvgPrimitive)}
          </filter>
        ))}
      </defs>
    </svg>
  );
}
