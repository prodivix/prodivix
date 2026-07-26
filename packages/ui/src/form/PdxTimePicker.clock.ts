import type { PdxPickerOption } from './PdxPickerListbox';

/**
 * Time arithmetic and option building for the time family.
 *
 * Times are `HH:mm` strings, which compare and clamp lexicographically, so
 * bounds, stepping and option building are all plain string operations rather
 * than three different `Date` dances.
 */

export interface PdxClockTime {
  hour: number;
  minute: number;
}

const MINUTES_IN_DAY = 24 * 60;
const TIME_PATTERN = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

const timeLabelFormat = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

const pad = (value: number) => String(value).padStart(2, '0');

export const parseTimeValue = (
  value: string | undefined
): PdxClockTime | undefined => {
  const match = value?.trim().match(TIME_PATTERN);
  if (!match) return undefined;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour > 23 || minute > 59) return undefined;

  return { hour, minute };
};

export const formatTimeValue = ({ hour, minute }: PdxClockTime) =>
  `${pad(hour)}:${pad(minute)}`;

export const timeToMinutes = (value: string) => {
  const time = parseTimeValue(value);

  return time ? time.hour * 60 + time.minute : undefined;
};

export const minutesToTime = (minutes: number) =>
  formatTimeValue({
    hour: Math.floor(minutes / 60),
    minute: minutes % 60,
  });

export const clampTimeValue = (value: string, min?: string, max?: string) => {
  if (min && parseTimeValue(min) && value < min) return min;
  if (max && parseTimeValue(max) && value > max) return max;

  return value;
};

/**
 * Steps by whole minutes. Without bounds the clock wraps across midnight, which
 * is what a time field should do; with bounds it stops at them instead.
 */
export const addMinutesToTime = (
  value: string,
  amount: number,
  min?: string,
  max?: string
) => {
  const base = timeToMinutes(value) ?? 0;
  const bounded = Boolean(min ?? max);
  const raw = base + amount;
  const wrapped = ((raw % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;

  if (!bounded) return minutesToTime(wrapped);

  return clampTimeValue(
    minutesToTime(Math.min(Math.max(raw, 0), MINUTES_IN_DAY - 1)),
    min,
    max
  );
};

/** Localised `HH:mm`, used as the option label and to announce the value. */
export const formatTimeLabel = (value: string) => {
  const time = parseTimeValue(value);

  return time
    ? timeLabelFormat.format(Date.UTC(1970, 0, 1, time.hour, time.minute))
    : value;
};

export interface BuildTimeOptionsInput {
  max?: string;
  min?: string;
  /** Minutes between offered times. */
  step: number;
}

export const buildTimeOptions = ({
  max,
  min,
  step,
}: BuildTimeOptionsInput): PdxPickerOption[] => {
  const interval = Math.min(Math.max(Math.round(step), 1), MINUTES_IN_DAY);
  const from = timeToMinutes(min ?? '') ?? 0;
  const to = timeToMinutes(max ?? '') ?? MINUTES_IN_DAY - 1;
  const options: PdxPickerOption[] = [];

  for (let minutes = from; minutes <= to; minutes += interval) {
    const value = minutesToTime(minutes);
    options.push({ label: formatTimeLabel(value), value });
  }

  return options;
};

/** Option index closest to `value`, so an open list starts where the field is. */
export const nearestTimeOptionIndex = (
  options: readonly PdxPickerOption[],
  value: string
) => {
  const target = timeToMinutes(value);
  if (target === undefined || options.length === 0) return -1;

  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  options.forEach((option, index) => {
    const minutes = timeToMinutes(option.value);
    if (minutes === undefined) return;

    const distance = Math.abs(minutes - target);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
};
