import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InspectorTextInput } from './InspectorTextInput';
import {
  CSS_ABSOLUTE_LENGTH_UNITS,
  CSS_CONTAINER_LENGTH_UNITS,
  CSS_FONT_RELATIVE_LENGTH_UNITS,
  CSS_PERCENTAGE_UNIT,
  CSS_VIEWPORT_LENGTH_UNITS,
} from '@/editor/features/blueprint/editor/inspector/components/units/cssUnits';

type UnitGroup = {
  label: string;
  units: Array<string | UnitOption>;
};

type UnitOption = {
  unit: string;
  title?: string;
};

export type UnitInputValue = number | string | undefined;

export type UnitInputQuantity =
  | 'all'
  | 'length'
  | 'length-percentage'
  | 'percentage'
  | 'angle'
  | 'time'
  | 'frequency'
  | 'resolution';

type UnitInputProps = {
  value: UnitInputValue;
  onChange: (value: UnitInputValue) => void;
  placeholder?: string;
  disabled?: boolean;
  units?: UnitGroup[];
  quantity?: UnitInputQuantity;
};

type NormalizedUnitGroup = {
  label: string;
  units: Array<{ unit: string; title: string }>;
};

const normalizeGroups = (
  groups: UnitGroup[],
  getUnitTitle: (unit: string) => string
): NormalizedUnitGroup[] =>
  groups.map((group) => ({
    label: group.label,
    units: group.units.map((entry) => {
      if (typeof entry === 'string')
        return { unit: entry, title: getUnitTitle(entry) };
      return {
        unit: entry.unit,
        title: entry.title ?? getUnitTitle(entry.unit),
      };
    }),
  }));

const getGroupsForQuantity = (
  quantity: UnitInputQuantity,
  t: (key: string) => string
): UnitGroup[] => {
  // https://developer.mozilla.org/docs/Web/CSS/length
  const GROUPS_LENGTH: UnitGroup[] = [
    {
      label: t('unitInput.groups.absoluteLength'),
      units: [...CSS_ABSOLUTE_LENGTH_UNITS],
    },
    {
      label: t('unitInput.groups.fontRelative'),
      units: [...CSS_FONT_RELATIVE_LENGTH_UNITS],
    },
    {
      label: t('unitInput.groups.viewport'),
      units: [...CSS_VIEWPORT_LENGTH_UNITS],
    },
    {
      label: t('unitInput.groups.container'),
      units: [...CSS_CONTAINER_LENGTH_UNITS],
    },
  ];

  // https://developer.mozilla.org/docs/Web/CSS/percentage
  const GROUPS_PERCENTAGE: UnitGroup[] = [
    { label: t('unitInput.groups.percentage'), units: [CSS_PERCENTAGE_UNIT] },
  ];

  // https://developer.mozilla.org/docs/Web/CSS/angle
  const GROUPS_ANGLE: UnitGroup[] = [
    {
      label: t('unitInput.groups.angle'),
      units: ['deg', 'grad', 'rad', 'turn'],
    },
  ];

  // https://developer.mozilla.org/docs/Web/CSS/time
  const GROUPS_TIME: UnitGroup[] = [
    { label: t('unitInput.groups.time'), units: ['s', 'ms'] },
  ];

  // https://developer.mozilla.org/docs/Web/CSS/frequency
  const GROUPS_FREQUENCY: UnitGroup[] = [
    { label: t('unitInput.groups.frequency'), units: ['Hz', 'kHz'] },
  ];

  // https://developer.mozilla.org/docs/Web/CSS/resolution
  const GROUPS_RESOLUTION: UnitGroup[] = [
    {
      label: t('unitInput.groups.resolution'),
      units: ['dpi', 'dpcm', 'dppx'],
    },
  ];

  switch (quantity) {
    case 'length':
      return GROUPS_LENGTH;
    case 'length-percentage':
      return [...GROUPS_LENGTH, ...GROUPS_PERCENTAGE];
    case 'percentage':
      return GROUPS_PERCENTAGE;
    case 'angle':
      return GROUPS_ANGLE;
    case 'time':
      return GROUPS_TIME;
    case 'frequency':
      return GROUPS_FREQUENCY;
    case 'resolution':
      return GROUPS_RESOLUTION;
    case 'all':
    default:
      return [
        ...GROUPS_LENGTH,
        ...GROUPS_PERCENTAGE,
        ...GROUPS_ANGLE,
        ...GROUPS_TIME,
        ...GROUPS_FREQUENCY,
        ...GROUPS_RESOLUTION,
      ];
  }
};

const isCompleteNumber = (value: string) => /^-?\d+(?:\.\d+)?$/.test(value);

const sanitizeAmount = (raw: string) => {
  const stripped = raw.replace(/[^\d.\-]/g, '');
  if (!stripped) return '';
  const isNegative = stripped.startsWith('-');
  const withoutSigns = stripped.replace(/-/g, '');
  const firstDot = withoutSigns.indexOf('.');
  const normalized =
    firstDot === -1
      ? withoutSigns
      : `${withoutSigns.slice(0, firstDot + 1)}${withoutSigns.slice(firstDot + 1).replace(/\./g, '')}`;
  return `${isNegative ? '-' : ''}${normalized}`;
};

const parseValue = (
  value: UnitInputValue
): { amount: string; unit: string } => {
  if (typeof value === 'number') return { amount: String(value), unit: 'px' };
  if (typeof value !== 'string') return { amount: '', unit: 'px' };

  const trimmed = value.trim();
  if (!trimmed) return { amount: '', unit: 'px' };

  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)([a-z%]+)$/i);
  if (match) return { amount: match[1], unit: match[2] };

  const numeric = trimmed.match(/^-?\d+(?:\.\d+)?$/);
  if (numeric) return { amount: trimmed, unit: 'px' };

  return { amount: trimmed, unit: 'px' };
};

const toOutput = (amount: string, unit: string): UnitInputValue => {
  const trimmed = amount.trim();
  if (!trimmed) return undefined;

  if (isCompleteNumber(trimmed)) {
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber) && unit === 'px') return asNumber;
  }

  return `${trimmed}${unit}`;
};

export function UnitInput({
  value,
  onChange,
  placeholder,
  disabled = false,
  units,
  quantity = 'all',
}: UnitInputProps) {
  const { t } = useTranslation('blueprint');

  const getUnitTitle = (unit: string): string => {
    return t(`unitInput.units.${unit}`, { defaultValue: unit });
  };

  const parsed = useMemo(() => parseValue(value), [value]);
  const groups = useMemo(
    () =>
      normalizeGroups(units ?? getGroupsForQuantity(quantity, t), getUnitTitle),
    [quantity, units, t]
  );
  const [draftAmount, setDraftAmount] = useState(parsed.amount);
  const [draftUnit, setDraftUnit] = useState(parsed.unit);
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setDraftAmount(parsed.amount);
    setDraftUnit(parsed.unit);
  }, [parsed.amount, parsed.unit]);

  useEffect(() => {
    if (!isOpen || !buttonRef.current) return;

    const updatePosition = () => {
      if (!buttonRef.current) return;

      const rect = buttonRef.current.getBoundingClientRect();
      const menuHeight = 200;
      const menuWidth = 400;
      const gap = 6;

      let top = rect.top - menuHeight - gap;
      let left = rect.right - menuWidth;

      if (top < 0) {
        top = rect.bottom + gap;
      }

      if (left < 0) {
        left = 0;
      }

      if (left + menuWidth > window.innerWidth) {
        left = window.innerWidth - menuWidth;
      }

      setMenuPosition({ top, left });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (event: MouseEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      className={`InspectorUnitInput relative w-24 ${disabled ? 'Disabled opacity-60' : ''}`.trim()}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setIsOpen(false);
      }}
    >
      <div className="InspectorUnitInputFrame inline-flex h-7 w-full items-center justify-between overflow-hidden rounded-md border border-(--border-default) bg-(--bg-canvas)">
        <div className="InspectorUnitInputAmount w-12 flex-none [&_.InspectorTextInput]:h-7 [&_.InspectorTextInput]:px-1.5 [&_.InspectorTextInput]:text-right [&_.InspectorTextInput]:tabular-nums">
          <InspectorTextInput
            value={draftAmount}
            onChange={(nextAmount) => {
              const sanitized = sanitizeAmount(nextAmount);
              setDraftAmount(sanitized);
              if (!sanitized) {
                onChange(undefined);
                return;
              }
              if (isCompleteNumber(sanitized)) {
                onChange(toOutput(sanitized, draftUnit));
                return;
              }
              // Keep incomplete numeric drafts (e.g. "-", ".", "-.") without appending unit.
              onChange(sanitized);
            }}
            placeholder={placeholder}
            disabled={disabled}
            inputMode="decimal"
          />
        </div>
        <span
          className="InspectorUnitInputDivider h-[18px] w-px flex-none bg-(--border-default)"
          aria-hidden="true"
        />
        <div className="InspectorUnitInputUnit flex h-full flex-none items-center justify-between">
          <button
            ref={buttonRef}
            type="button"
            className="InspectorUnitInputUnitButton inline-flex h-full w-[47px] items-center justify-between gap-1 border-0 bg-transparent px-2 text-xs text-(--text-primary) outline-none disabled:cursor-not-allowed"
            disabled={disabled}
            aria-label={draftUnit}
            aria-expanded={isOpen}
            title={getUnitTitle(draftUnit)}
            onClick={() => setIsOpen((prev) => !prev)}
          >
            <span>{draftUnit}</span>
          </button>
        </div>
      </div>
      {isOpen && !disabled && menuPosition ? (
        <div
          className="InspectorUnitInputUnitMenu fixed z-[8] max-h-[200px] w-[400px] overflow-auto rounded-xl border border-(--border-default) bg-(--bg-canvas) p-2 shadow-(--shadow-md)"
          role="listbox"
          style={{
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
          }}
        >
          {(() => {
            const knownUnits = groups.flatMap((group) =>
              group.units.map((u) => u.unit)
            );
            const hasCurrent = knownUnits.includes(draftUnit);
            const currentGroup: NormalizedUnitGroup[] = hasCurrent
              ? []
              : [
                  {
                    label: t('unitInput.groups.current'),
                    units: [
                      {
                        unit: draftUnit,
                        title: getUnitTitle(draftUnit),
                      },
                    ],
                  },
                ];
            return [...currentGroup, ...groups];
          })().map((group) => (
            <div
              key={group.label}
              className="InspectorUnitInputUnitGroup flex flex-col gap-1.5 [&+&]:mt-2.5"
            >
              <div className="InspectorUnitInputUnitGroupLabel text-[10px] tracking-[0.06em] text-(--text-muted) uppercase">
                {group.label}
              </div>
              <div className="InspectorUnitInputUnitGroupItems grid [grid-template-columns:repeat(auto-fit,minmax(44px,1fr))] gap-1.5">
                {group.units.map((unitOption) => (
                  <button
                    key={unitOption.unit}
                    type="button"
                    className={`InspectorUnitInputUnitOption h-[26px] cursor-pointer rounded-[10px] border border-(--border-default) bg-transparent text-xs text-(--text-secondary) hover:border-(--border-strong) hover:text-(--text-primary) ${
                      unitOption.unit === draftUnit
                        ? 'Active border-(--border-strong) bg-(--bg-raised) text-(--text-primary)'
                        : ''
                    }`.trim()}
                    title={unitOption.title}
                    onClick={() => {
                      setDraftUnit(unitOption.unit);
                      if (draftAmount && isCompleteNumber(draftAmount)) {
                        onChange(toOutput(draftAmount, unitOption.unit));
                      }
                      setIsOpen(false);
                    }}
                    role="option"
                    aria-selected={unitOption.unit === draftUnit}
                  >
                    {unitOption.unit}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
