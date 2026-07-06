import { type ReactNode } from 'react';

export type IconButtonOption<T extends string = string> = {
  value: T;
  icon: ReactNode;
  label: string;
};

type IconButtonGroupProps<T extends string = string> = {
  value: T;
  options: IconButtonOption<T>[];
  onChange: (value: T) => void;
  layout?: 'horizontal' | 'grid' | 'grid-2x2';
  density?: 'default' | 'dense';
  columns?: 2 | 4 | 5 | 6 | 7;
  fullGridWidth?: boolean;
  showLabels?: boolean;
};

export function IconButtonGroup<T extends string = string>({
  value,
  options,
  onChange,
  layout = 'horizontal',
  density = 'default',
  columns,
  fullGridWidth = false,
  showLabels,
}: IconButtonGroupProps<T>) {
  const resolvedShowLabels = showLabels ?? density === 'default';
  const denseColumns =
    columns ?? (layout === 'grid-2x2' ? 2 : Math.min(options.length, 7));
  const denseWidthClass = fullGridWidth
    ? 'w-64'
    : {
        2: 'w-16',
        4: 'w-32',
        5: 'w-40',
        6: 'w-48',
        7: 'w-56',
      }[denseColumns];
  const denseGridClass =
    layout === 'grid-2x2'
      ? 'inline-grid grid-cols-[repeat(2,32px)] grid-rows-[repeat(2,32px)] overflow-hidden rounded-sm bg-(--bg-canvas) ring-1 ring-(--border-default) ring-inset'
      : `inline-grid overflow-hidden rounded-sm bg-(--bg-canvas) ring-1 ring-(--border-default) ring-inset ${denseWidthClass} ${
          {
            2: 'grid-cols-[repeat(2,32px)]',
            4: 'grid-cols-[repeat(4,32px)]',
            5: 'grid-cols-[repeat(5,32px)]',
            6: 'grid-cols-[repeat(6,32px)]',
            7: 'grid-cols-[repeat(7,32px)]',
          }[denseColumns]
        }`;
  const containerClass =
    density === 'dense'
      ? denseGridClass
      : layout === 'horizontal'
        ? 'flex flex-col gap-0.5'
        : 'grid grid-cols-2 gap-0.5';

  const buttonClass =
    density === 'dense'
      ? 'flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent text-(--text-muted) shadow-none transition-colors hover:bg-(--bg-raised) hover:text-(--text-primary) hover:shadow-none'
      : 'flex w-full min-w-16 flex-row items-center justify-between gap-1 rounded px-2 py-1.5 text-(--text-muted) transition-all';
  const iconClass =
    'flex h-6 w-6 items-center justify-center [&>svg]:h-6 [&>svg]:w-6';
  const denseIconClass =
    'flex h-7 w-7 items-center justify-center rounded-sm shadow-none transition-colors hover:shadow-none [&>svg]:h-6 [&>svg]:w-6';
  const activeClass =
    density === 'dense'
      ? 'bg-(--bg-raised) text-(--text-primary) shadow-[inset_0_0_0_1px_var(--border-strong)]'
      : 'bg-(--bg-raised) font-medium text-(--text-primary) hover:bg-(--bg-panel)';
  const inactiveClass =
    layout === 'horizontal'
      ? 'bg-transparent hover:bg-(--bg-raised) hover:text-(--text-secondary)'
      : 'bg-transparent hover:bg-(--bg-raised) hover:text-(--text-secondary)';

  return (
    <div className={containerClass}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`${buttonClass} ${
            value === option.value ? activeClass : inactiveClass
          }`}
          onClick={() => onChange(option.value)}
          title={option.label}
          aria-label={option.label}
        >
          <span className={density === 'dense' ? denseIconClass : iconClass}>
            {option.icon}
          </span>
          {resolvedShowLabels ? (
            <span className="text-center text-[11px] leading-[1.2] whitespace-nowrap">
              {option.label}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
