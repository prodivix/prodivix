import './PdxDatePicker.calendar.scss';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  type KeyboardEvent,
} from 'react';

/**
 * Calendar arithmetic and the month grid, owned once for the whole date family.
 *
 * `PdxDatePicker` and `PdxDateRangePicker` differ only in how many ends of a
 * selection they track; month navigation, roving focus, disabled bounds and the
 * ARIA grid contract are the same problem and are solved here.
 */

export interface PdxCalendarDate {
  day: number;
  /** 1-12. */
  month: number;
  year: number;
}

/** Monday, matching the ISO date format these controls read and write. */
const WEEK_START_DAY = 1;
const DAYS_IN_WEEK = 7;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A Monday, used only to enumerate weekday names in display order. */
const WEEKDAY_REFERENCE_UTC = Date.UTC(2024, 0, 1);

const weekdayShortFormat = new Intl.DateTimeFormat(undefined, {
  timeZone: 'UTC',
  weekday: 'short',
});
const weekdayLongFormat = new Intl.DateTimeFormat(undefined, {
  timeZone: 'UTC',
  weekday: 'long',
});
const monthCaptionFormat = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  timeZone: 'UTC',
  year: 'numeric',
});
const dayLabelFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
  weekday: 'long',
  year: 'numeric',
});

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

const toUtcTime = ({ day, month, year }: PdxCalendarDate) =>
  Date.UTC(year, month - 1, day);

const fromUtcTime = (time: number): PdxCalendarDate => {
  const date = new Date(time);

  return {
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  };
};

export const parseIsoDate = (
  value: string | undefined
): PdxCalendarDate | undefined => {
  const match = value?.trim().match(ISO_DATE_PATTERN);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = { day, month, year };

  if (month < 1 || month > 12 || day < 1) return undefined;
  const roundTrip = fromUtcTime(toUtcTime(candidate));

  return roundTrip.day === day &&
    roundTrip.month === month &&
    roundTrip.year === year
    ? candidate
    : undefined;
};

export const formatIsoDate = ({ day, month, year }: PdxCalendarDate) =>
  `${pad(year, 4)}-${pad(month)}-${pad(day)}`;

export const todayIsoDate = () => {
  const now = new Date();

  return formatIsoDate({
    day: now.getDate(),
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  });
};

export const addCalendarDays = (isoDate: string, amount: number) => {
  const date = parseIsoDate(isoDate);
  if (!date) return isoDate;

  return formatIsoDate(fromUtcTime(toUtcTime(date) + amount * 86_400_000));
};

/** Month arithmetic clamps the day, so 31 January plus one month is 28/29 February. */
export const addCalendarMonths = (isoDate: string, amount: number) => {
  const date = parseIsoDate(isoDate);
  if (!date) return isoDate;

  const monthIndex = date.year * 12 + (date.month - 1) + amount;
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  const day = Math.min(date.day, daysInMonth(year, month));

  return formatIsoDate({ day, month, year });
};

export const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

export const clampIsoDate = (isoDate: string, min?: string, max?: string) => {
  if (min && parseIsoDate(min) && isoDate < min) return min;
  if (max && parseIsoDate(max) && isoDate > max) return max;

  return isoDate;
};

export const isIsoDateWithinBounds = (
  isoDate: string,
  min?: string,
  max?: string
) => {
  if (min && parseIsoDate(min) && isoDate < min) return false;
  if (max && parseIsoDate(max) && isoDate > max) return false;

  return true;
};

/** Localised full date, used as the accessible name of a day cell. */
export const formatCalendarDayLabel = (isoDate: string) => {
  const date = parseIsoDate(isoDate);

  return date ? dayLabelFormat.format(toUtcTime(date)) : isoDate;
};

export const formatCalendarMonthLabel = (isoDate: string) => {
  const date = parseIsoDate(isoDate);

  return date ? monthCaptionFormat.format(toUtcTime(date)) : isoDate;
};

/** First and last day of the month a date falls in. */
const monthEdges = (isoDate: string) => {
  const date = parseIsoDate(isoDate) ?? { day: 1, month: 1, year: 1970 };

  return {
    first: formatIsoDate({ day: 1, month: date.month, year: date.year }),
    last: formatIsoDate({
      day: daysInMonth(date.year, date.month),
      month: date.month,
      year: date.year,
    }),
  };
};

/** Position of a date within the displayed week, 0 for the first column. */
const weekdayOffset = (isoDate: string) => {
  const date = parseIsoDate(isoDate);
  if (!date) return 0;

  const weekday = new Date(toUtcTime(date)).getUTCDay();

  return (weekday - WEEK_START_DAY + DAYS_IN_WEEK) % DAYS_IN_WEEK;
};

const buildMonthWeeks = (isoDate: string) => {
  const date = parseIsoDate(isoDate);
  if (!date) return [];

  const leading = weekdayOffset(
    formatIsoDate({ day: 1, month: date.month, year: date.year })
  );
  const total = daysInMonth(date.year, date.month);
  const weeks: Array<Array<string | undefined>> = [];

  let cells: Array<string | undefined> = new Array<undefined>(leading).fill(
    undefined
  );

  for (let day = 1; day <= total; day += 1) {
    cells.push(formatIsoDate({ day, month: date.month, year: date.year }));

    if (cells.length === DAYS_IN_WEEK) {
      weeks.push(cells);
      cells = [];
    }
  }

  if (cells.length > 0) {
    while (cells.length < DAYS_IN_WEEK) cells.push(undefined);
    weeks.push(cells);
  }

  return weeks;
};

const weekdayHeaders = Array.from(
  { length: DAYS_IN_WEEK },
  (_unused, index) => {
    const time = WEEKDAY_REFERENCE_UTC + index * 86_400_000;

    return {
      long: weekdayLongFormat.format(time),
      short: weekdayShortFormat.format(time),
    };
  }
);

export interface PdxCalendarPanelHandle {
  focusActiveDay: () => void;
}

export interface PdxCalendarPanelProps {
  /** Day that owns the grid's single tab stop. */
  focusedDate: string;
  max?: string;
  min?: string;
  onFocusedDateChange: (isoDate: string) => void;
  onSelect: (isoDate: string) => void;
  /** Inclusive selection. A single date sets both ends to the same day. */
  rangeEnd?: string;
  rangeStart?: string;
}

/**
 * A month grid that is fully operable from the keyboard: arrows move by day and
 * week, Home/End jump to the ends of the week, PageUp/PageDown move by month and
 * with Shift by year. Only the focused day is a tab stop, so a screen reader
 * reads the grid as one control rather than forty buttons.
 */
const PdxCalendarPanel = forwardRef<
  PdxCalendarPanelHandle,
  PdxCalendarPanelProps
>(function PdxCalendarPanel(
  {
    focusedDate,
    max,
    min,
    onFocusedDateChange,
    onSelect,
    rangeEnd,
    rangeStart,
  },
  ref
) {
  const captionId = `${useId().replaceAll(':', '')}-caption`;
  const dayRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const shouldRestoreFocus = useRef(false);
  const today = todayIsoDate();
  const weeks = buildMonthWeeks(focusedDate);

  const focusActiveDay = useCallback(() => {
    dayRefs.current.get(focusedDate)?.focus();
  }, [focusedDate]);

  useImperativeHandle(ref, () => ({ focusActiveDay }), [focusActiveDay]);

  useEffect(() => {
    if (!shouldRestoreFocus.current) return;
    shouldRestoreFocus.current = false;
    dayRefs.current.get(focusedDate)?.focus();
  }, [focusedDate]);

  const moveFocus = (nextDate: string) => {
    shouldRestoreFocus.current = true;
    onFocusedDateChange(clampIsoDate(nextDate, min, max));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    const weekday = weekdayOffset(focusedDate);

    switch (event.key) {
      case 'ArrowLeft':
        moveFocus(addCalendarDays(focusedDate, -1));
        break;
      case 'ArrowRight':
        moveFocus(addCalendarDays(focusedDate, 1));
        break;
      case 'ArrowUp':
        moveFocus(addCalendarDays(focusedDate, -DAYS_IN_WEEK));
        break;
      case 'ArrowDown':
        moveFocus(addCalendarDays(focusedDate, DAYS_IN_WEEK));
        break;
      case 'Home':
        moveFocus(addCalendarDays(focusedDate, -weekday));
        break;
      case 'End':
        moveFocus(addCalendarDays(focusedDate, DAYS_IN_WEEK - 1 - weekday));
        break;
      case 'PageUp':
        moveFocus(addCalendarMonths(focusedDate, event.shiftKey ? -12 : -1));
        break;
      case 'PageDown':
        moveFocus(addCalendarMonths(focusedDate, event.shiftKey ? 12 : 1));
        break;
      default:
        return;
    }

    event.preventDefault();
  };

  const isSelectedDay = (isoDate: string) =>
    (rangeStart !== undefined && isoDate === rangeStart) ||
    (rangeEnd !== undefined && isoDate === rangeEnd);

  const isWithinRange = (isoDate: string) =>
    rangeStart !== undefined &&
    rangeEnd !== undefined &&
    isoDate >= rangeStart &&
    isoDate <= rangeEnd;

  const changeMonth = (amount: number) => {
    onFocusedDateChange(
      clampIsoDate(addCalendarMonths(focusedDate, amount), min, max)
    );
  };

  // A month button that could only land back on the same day would look broken,
  // so it says so instead of moving nowhere.
  const monthBounds = monthEdges(focusedDate);
  const canGoBack = !min || min < monthBounds.first;
  const canGoForward = !max || max > monthBounds.last;

  return (
    <div className="PdxCalendar">
      <div className="PdxCalendarHeader">
        <button
          aria-label="Previous month"
          className="PdxCalendarNav"
          disabled={!canGoBack}
          onClick={() => {
            changeMonth(-1);
          }}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={14} />
        </button>
        <div aria-live="polite" className="PdxCalendarCaption" id={captionId}>
          {formatCalendarMonthLabel(focusedDate)}
        </div>
        <button
          aria-label="Next month"
          className="PdxCalendarNav"
          disabled={!canGoForward}
          onClick={() => {
            changeMonth(1);
          }}
          type="button"
        >
          <ChevronRight aria-hidden="true" size={14} />
        </button>
      </div>

      <table
        aria-labelledby={captionId}
        className="PdxCalendarGrid"
        onKeyDown={handleKeyDown}
        role="grid"
      >
        <thead>
          <tr role="row">
            {weekdayHeaders.map((weekday) => (
              <th
                key={weekday.long}
                abbr={weekday.long}
                className="PdxCalendarWeekday"
                role="columnheader"
                scope="col"
              >
                {weekday.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, weekIndex) => (
            <tr key={`week-${String(weekIndex)}`} role="row">
              {week.map((isoDate, index) => {
                if (!isoDate) {
                  return (
                    <td
                      key={`empty-${String(index)}`}
                      className="PdxCalendarCell"
                      role="gridcell"
                    />
                  );
                }

                const outOfBounds = !isIsoDateWithinBounds(isoDate, min, max);

                return (
                  <td
                    key={isoDate}
                    aria-selected={
                      isSelectedDay(isoDate) || isWithinRange(isoDate)
                    }
                    className="PdxCalendarCell"
                    role="gridcell"
                  >
                    <button
                      ref={(element) => {
                        dayRefs.current.set(isoDate, element);
                      }}
                      aria-current={isoDate === today ? 'date' : undefined}
                      aria-disabled={outOfBounds || undefined}
                      aria-label={formatCalendarDayLabel(isoDate)}
                      className="PdxCalendarDay"
                      data-edge={isSelectedDay(isoDate) ? 'true' : undefined}
                      data-range={
                        isWithinRange(isoDate) && !isSelectedDay(isoDate)
                          ? 'true'
                          : undefined
                      }
                      onClick={() => {
                        if (outOfBounds) return;
                        onSelect(isoDate);
                      }}
                      tabIndex={isoDate === focusedDate ? 0 : -1}
                      type="button"
                    >
                      {parseIsoDate(isoDate)?.day}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

export default PdxCalendarPanel;
