import { utf8ToBytes } from '@noble/hashes/utils.js';
import { redactExecutionConsoleText } from './executionConsole';
import {
  EXECUTION_TERMINAL_LIMITS,
  EXECUTION_TERMINAL_TRUNCATION_MARKER,
  normalizeSize,
  truncateUtf8,
  type ExecutionTerminalOutputRecord,
  type ExecutionTerminalOutputStream,
  type ExecutionTerminalSize,
} from './executionTerminal';

export const EXECUTION_TERMINAL_EMULATOR_LIMITS = Object.freeze({
  maximumScrollbackRows: 2_000,
  defaultScrollbackRows: 1_000,
  maximumControlSequenceCodeUnits: 256,
  maximumOperatingSystemCommandCodeUnits: 1_024,
  maximumTitleCodeUnits: 256,
});

export type ExecutionTerminalEmulatorColor =
  | Readonly<{ kind: 'palette'; index: number }>
  | Readonly<{ kind: 'rgb'; red: number; green: number; blue: number }>;

export type ExecutionTerminalEmulatorStyle = Readonly<{
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  inverse: boolean;
  hidden: boolean;
  strikethrough: boolean;
  foreground?: ExecutionTerminalEmulatorColor;
  background?: ExecutionTerminalEmulatorColor;
}>;

export type ExecutionTerminalEmulatorRun = Readonly<{
  text: string;
  stream: ExecutionTerminalOutputStream;
  style: ExecutionTerminalEmulatorStyle;
}>;

export type ExecutionTerminalEmulatorLine = Readonly<{
  index: number;
  text: string;
  wrapped: boolean;
  runs: readonly ExecutionTerminalEmulatorRun[];
}>;

export type ExecutionTerminalEmulatorSnapshot = Readonly<{
  size: ExecutionTerminalSize;
  lines: readonly ExecutionTerminalEmulatorLine[];
  screenStartLine: number;
  cursor: Readonly<{ line: number; column: number; visible: boolean }>;
  title?: string;
  latestOutputCursor: number;
  terminalSessionId?: string;
  executionId?: string;
  jobId?: string;
  modes: Readonly<{
    alternateScreen: boolean;
    applicationCursorKeys: boolean;
    bracketedPaste: boolean;
    wraparound: boolean;
  }>;
  metrics: Readonly<{
    processedRecords: number;
    gapCount: number;
    redactedRecords: number;
    truncatedRecords: number;
    bellCount: number;
    discardedControlSequences: number;
  }>;
}>;

export type ExecutionTerminalEmulator = Readonly<{
  consume(
    input: Readonly<{
      records: readonly ExecutionTerminalOutputRecord[];
      gap?: boolean;
    }>
  ): ExecutionTerminalEmulatorSnapshot;
  resize(size: ExecutionTerminalSize): ExecutionTerminalEmulatorSnapshot;
  reset(size?: ExecutionTerminalSize): ExecutionTerminalEmulatorSnapshot;
  getSnapshot(): ExecutionTerminalEmulatorSnapshot;
}>;

type MutableStyle = {
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  inverse: boolean;
  hidden: boolean;
  strikethrough: boolean;
  foreground?: ExecutionTerminalEmulatorColor;
  background?: ExecutionTerminalEmulatorColor;
};

type TerminalCell = Readonly<{
  text: string;
  width: 0 | 1 | 2;
  stream: ExecutionTerminalOutputStream;
  style: ExecutionTerminalEmulatorStyle;
}>;

type TerminalLine = {
  cells: Array<TerminalCell | undefined>;
  wrapped: boolean;
};

type SavedCursor = Readonly<{
  row: number;
  column: number;
  style: ExecutionTerminalEmulatorStyle;
}>;

type TerminalBuffer = {
  lines: TerminalLine[];
  cursorRow: number;
  cursorColumn: number;
  savedCursor?: SavedCursor;
  scrollTop: number;
  scrollBottom: number;
  style: ExecutionTerminalEmulatorStyle;
};

type ParserMode =
  | 'ground'
  | 'escape'
  | 'csi'
  | 'osc'
  | 'osc-escape'
  | 'ignored-string'
  | 'ignored-string-escape';

const DEFAULT_STYLE: ExecutionTerminalEmulatorStyle = Object.freeze({
  bold: false,
  dim: false,
  italic: false,
  underline: false,
  inverse: false,
  hidden: false,
  strikethrough: false,
});

const createLine = (columns: number): TerminalLine => ({
  cells: Array.from({ length: columns }),
  wrapped: false,
});

const createBuffer = (size: ExecutionTerminalSize): TerminalBuffer => ({
  lines: Array.from({ length: size.rows }, () => createLine(size.columns)),
  cursorRow: 0,
  cursorColumn: 0,
  scrollTop: 0,
  scrollBottom: size.rows - 1,
  style: DEFAULT_STYLE,
});

const freezeColor = (
  color: ExecutionTerminalEmulatorColor | undefined
): ExecutionTerminalEmulatorColor | undefined =>
  color ? Object.freeze({ ...color }) : undefined;

const freezeStyle = (
  style: MutableStyle | ExecutionTerminalEmulatorStyle
): ExecutionTerminalEmulatorStyle =>
  Object.freeze({
    bold: style.bold,
    dim: style.dim,
    italic: style.italic,
    underline: style.underline,
    inverse: style.inverse,
    hidden: style.hidden,
    strikethrough: style.strikethrough,
    ...(style.foreground ? { foreground: freezeColor(style.foreground) } : {}),
    ...(style.background ? { background: freezeColor(style.background) } : {}),
  });

const colorEquals = (
  left: ExecutionTerminalEmulatorColor | undefined,
  right: ExecutionTerminalEmulatorColor | undefined
): boolean => {
  if (!left || !right) return left === right;
  if (left.kind !== right.kind) return false;
  return left.kind === 'palette' && right.kind === 'palette'
    ? left.index === right.index
    : left.kind === 'rgb' &&
        right.kind === 'rgb' &&
        left.red === right.red &&
        left.green === right.green &&
        left.blue === right.blue;
};

const styleEquals = (
  left: ExecutionTerminalEmulatorStyle,
  right: ExecutionTerminalEmulatorStyle
): boolean =>
  left === right ||
  (left.bold === right.bold &&
    left.dim === right.dim &&
    left.italic === right.italic &&
    left.underline === right.underline &&
    left.inverse === right.inverse &&
    left.hidden === right.hidden &&
    left.strikethrough === right.strikethrough &&
    colorEquals(left.foreground, right.foreground) &&
    colorEquals(left.background, right.background));

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

const parameter = (
  parameters: readonly number[],
  index: number,
  fallback: number,
  zeroMeansFallback = true
): number => {
  const value = parameters[index];
  return value === undefined || (zeroMeansFallback && value === 0)
    ? fallback
    : value;
};

const parseParameters = (value: string): readonly number[] =>
  value.length === 0
    ? Object.freeze([0])
    : Object.freeze(
        value
          .replaceAll(':', ';')
          .split(';')
          .map((entry) => {
            if (!entry.length) return 0;
            const parsed = Number.parseInt(entry, 10);
            return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
          })
      );

const codePointWidth = (character: string): 0 | 1 | 2 => {
  const codePoint = character.codePointAt(0) ?? 0;
  if (
    codePoint === 0x200d ||
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x1ab0 && codePoint <= 0x1aff) ||
    (codePoint >= 0x1dc0 && codePoint <= 0x1dff) ||
    (codePoint >= 0x20d0 && codePoint <= 0x20ff) ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
  )
    return 0;
  if (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd))
  )
    return 2;
  return 1;
};

const normalizeScrollbackRows = (value: number | undefined): number => {
  const normalized =
    value ?? EXECUTION_TERMINAL_EMULATOR_LIMITS.defaultScrollbackRows;
  if (
    !Number.isSafeInteger(normalized) ||
    normalized < 0 ||
    normalized > EXECUTION_TERMINAL_EMULATOR_LIMITS.maximumScrollbackRows
  )
    throw new TypeError(
      'Execution terminal emulator scrollback rows are outside the budget.'
    );
  return normalized;
};

/**
 * Creates a DOM-free, bounded VT-style screen model. The PTY protocol remains
 * authoritative; this projection is disposable and can be rebuilt from the
 * retained output cursor window.
 */
export const createExecutionTerminalEmulator = (
  input?:
    | ExecutionTerminalSize
    | Readonly<{
        size?: ExecutionTerminalSize;
        maximumScrollbackRows?: number;
      }>
): ExecutionTerminalEmulator => {
  const initialSize = normalizeSize(
    input && 'columns' in input
      ? input
      : (input?.size ?? Object.freeze({ columns: 100, rows: 30 }))
  );
  const maximumScrollbackRows = normalizeScrollbackRows(
    input && !('columns' in input) ? input.maximumScrollbackRows : undefined
  );
  let size = initialSize;
  let primary = createBuffer(size);
  let alternate: TerminalBuffer | undefined;
  let alternateScreen = false;
  let savedPrimaryCursor: SavedCursor | undefined;
  let scrollback: TerminalLine[] = [];
  let parserMode: ParserMode = 'ground';
  let parserValue = '';
  let pendingStream: ExecutionTerminalOutputStream | undefined;
  let currentStream: ExecutionTerminalOutputStream = 'stdout';
  let cursorVisible = true;
  let applicationCursorKeys = false;
  let bracketedPaste = false;
  let wraparound = true;
  let title: string | undefined;
  let latestOutputCursor = 0;
  let terminalSessionId: string | undefined;
  let executionId: string | undefined;
  let jobId: string | undefined;
  let gapAlreadyProjected = false;
  let processedRecords = 0;
  let gapCount = 0;
  let redactedRecords = 0;
  let truncatedRecords = 0;
  let bellCount = 0;
  let discardedControlSequences = 0;

  const activeBuffer = (): TerminalBuffer => alternate ?? primary;

  const retainScrollback = (line: TerminalLine): void => {
    if (alternateScreen || maximumScrollbackRows === 0) return;
    scrollback.push(line);
    if (scrollback.length > maximumScrollbackRows)
      scrollback = scrollback.slice(-maximumScrollbackRows);
  };

  const clearWideCell = (line: TerminalLine, column: number): void => {
    const cell = line.cells[column];
    if (cell?.width === 0 && column > 0) {
      line.cells[column - 1] = undefined;
      line.cells[column] = undefined;
      return;
    }
    if (cell?.width === 2) {
      line.cells[column] = undefined;
      if (column + 1 < size.columns) line.cells[column + 1] = undefined;
      return;
    }
    line.cells[column] = undefined;
  };

  const clearRange = (line: TerminalLine, start: number, end: number): void => {
    const first = clamp(start, 0, size.columns - 1);
    const last = clamp(end, 0, size.columns - 1);
    for (let column = first; column <= last; column += 1)
      clearWideCell(line, column);
  };

  const scrollUp = (count = 1): void => {
    const buffer = activeBuffer();
    const normalized = clamp(
      count,
      1,
      buffer.scrollBottom - buffer.scrollTop + 1
    );
    for (let index = 0; index < normalized; index += 1) {
      const [removed] = buffer.lines.splice(buffer.scrollTop, 1);
      buffer.lines.splice(buffer.scrollBottom, 0, createLine(size.columns));
      if (
        removed &&
        buffer.scrollTop === 0 &&
        buffer.scrollBottom === size.rows - 1
      )
        retainScrollback(removed);
    }
  };

  const scrollDown = (count = 1): void => {
    const buffer = activeBuffer();
    const normalized = clamp(
      count,
      1,
      buffer.scrollBottom - buffer.scrollTop + 1
    );
    for (let index = 0; index < normalized; index += 1) {
      buffer.lines.splice(buffer.scrollBottom, 1);
      buffer.lines.splice(buffer.scrollTop, 0, createLine(size.columns));
    }
  };

  const lineFeed = (): void => {
    const buffer = activeBuffer();
    if (buffer.cursorRow === buffer.scrollBottom) scrollUp();
    else buffer.cursorRow = Math.min(size.rows - 1, buffer.cursorRow + 1);
  };

  const reverseIndex = (): void => {
    const buffer = activeBuffer();
    if (buffer.cursorRow === buffer.scrollTop) scrollDown();
    else buffer.cursorRow = Math.max(0, buffer.cursorRow - 1);
  };

  const saveCursor = (): void => {
    const buffer = activeBuffer();
    buffer.savedCursor = Object.freeze({
      row: buffer.cursorRow,
      column: buffer.cursorColumn,
      style: buffer.style,
    });
  };

  const restoreCursor = (): void => {
    const buffer = activeBuffer();
    const saved = buffer.savedCursor;
    if (!saved) return;
    buffer.cursorRow = clamp(saved.row, 0, size.rows - 1);
    buffer.cursorColumn = clamp(saved.column, 0, size.columns - 1);
    buffer.style = saved.style;
  };

  const writeCharacter = (character: string): void => {
    const buffer = activeBuffer();
    const width = codePointWidth(character);
    if (width === 0) {
      let column = Math.min(buffer.cursorColumn, size.columns - 1) - 1;
      if (
        column >= 0 &&
        buffer.lines[buffer.cursorRow]?.cells[column]?.width === 0
      )
        column -= 1;
      const cell = buffer.lines[buffer.cursorRow]?.cells[column];
      if (cell && cell.width !== 0)
        buffer.lines[buffer.cursorRow]!.cells[column] = Object.freeze({
          ...cell,
          text: `${cell.text}${character}`,
        });
      return;
    }
    if (
      buffer.cursorColumn >= size.columns ||
      (width === 2 && buffer.cursorColumn === size.columns - 1)
    ) {
      if (!wraparound) {
        buffer.cursorColumn = size.columns - 1;
        if (width === 2) return;
      } else {
        const previous = buffer.lines[buffer.cursorRow];
        if (previous) previous.wrapped = true;
        buffer.cursorColumn = 0;
        lineFeed();
      }
    }
    const line = buffer.lines[buffer.cursorRow];
    if (!line) return;
    clearWideCell(line, buffer.cursorColumn);
    if (width === 2 && buffer.cursorColumn + 1 < size.columns)
      clearWideCell(line, buffer.cursorColumn + 1);
    line.cells[buffer.cursorColumn] = Object.freeze({
      text: character,
      width,
      stream: currentStream,
      style: buffer.style,
    });
    if (width === 2)
      line.cells[buffer.cursorColumn + 1] = Object.freeze({
        text: '',
        width: 0,
        stream: currentStream,
        style: buffer.style,
      });
    buffer.cursorColumn += width;
  };

  const eraseDisplay = (mode: number): void => {
    const buffer = activeBuffer();
    if (mode === 3) {
      scrollback = [];
      return;
    }
    if (mode === 2) {
      buffer.lines.forEach((line) => clearRange(line, 0, size.columns - 1));
      return;
    }
    if (mode === 1) {
      for (let row = 0; row < buffer.cursorRow; row += 1)
        clearRange(buffer.lines[row]!, 0, size.columns - 1);
      clearRange(
        buffer.lines[buffer.cursorRow]!,
        0,
        Math.min(buffer.cursorColumn, size.columns - 1)
      );
      return;
    }
    clearRange(
      buffer.lines[buffer.cursorRow]!,
      Math.min(buffer.cursorColumn, size.columns - 1),
      size.columns - 1
    );
    for (let row = buffer.cursorRow + 1; row < size.rows; row += 1)
      clearRange(buffer.lines[row]!, 0, size.columns - 1);
  };

  const eraseLine = (mode: number): void => {
    const buffer = activeBuffer();
    const line = buffer.lines[buffer.cursorRow]!;
    if (mode === 2) clearRange(line, 0, size.columns - 1);
    else if (mode === 1)
      clearRange(line, 0, Math.min(buffer.cursorColumn, size.columns - 1));
    else
      clearRange(
        line,
        Math.min(buffer.cursorColumn, size.columns - 1),
        size.columns - 1
      );
  };

  const setStyle = (parameters: readonly number[]): void => {
    const buffer = activeBuffer();
    let style: MutableStyle = { ...buffer.style };
    for (let index = 0; index < parameters.length; index += 1) {
      const value = parameters[index] ?? 0;
      if (value === 0) style = { ...DEFAULT_STYLE };
      else if (value === 1) style.bold = true;
      else if (value === 2) style.dim = true;
      else if (value === 3) style.italic = true;
      else if (value === 4) style.underline = true;
      else if (value === 7) style.inverse = true;
      else if (value === 8) style.hidden = true;
      else if (value === 9) style.strikethrough = true;
      else if (value === 22) {
        style.bold = false;
        style.dim = false;
      } else if (value === 23) style.italic = false;
      else if (value === 24) style.underline = false;
      else if (value === 27) style.inverse = false;
      else if (value === 28) style.hidden = false;
      else if (value === 29) style.strikethrough = false;
      else if (value >= 30 && value <= 37)
        style.foreground = Object.freeze({
          kind: 'palette',
          index: value - 30,
        });
      else if (value === 39) delete style.foreground;
      else if (value >= 40 && value <= 47)
        style.background = Object.freeze({
          kind: 'palette',
          index: value - 40,
        });
      else if (value === 49) delete style.background;
      else if (value >= 90 && value <= 97)
        style.foreground = Object.freeze({
          kind: 'palette',
          index: value - 82,
        });
      else if (value >= 100 && value <= 107)
        style.background = Object.freeze({
          kind: 'palette',
          index: value - 92,
        });
      else if (value === 38 || value === 48) {
        const target = value === 38 ? 'foreground' : 'background';
        const mode = parameters[index + 1];
        if (mode === 5) {
          const palette = parameters[index + 2];
          if (palette !== undefined && palette >= 0 && palette <= 255)
            style[target] = Object.freeze({ kind: 'palette', index: palette });
          index += 2;
        } else if (mode === 2) {
          const red = parameters[index + 2];
          const green = parameters[index + 3];
          const blue = parameters[index + 4];
          if (
            red !== undefined &&
            green !== undefined &&
            blue !== undefined &&
            red <= 255 &&
            green <= 255 &&
            blue <= 255
          )
            style[target] = Object.freeze({
              kind: 'rgb',
              red,
              green,
              blue,
            });
          index += 4;
        }
      }
    }
    buffer.style = freezeStyle(style);
  };

  const setAlternateScreen = (enabled: boolean): void => {
    if (enabled === alternateScreen) return;
    if (enabled) {
      savedPrimaryCursor = Object.freeze({
        row: primary.cursorRow,
        column: primary.cursorColumn,
        style: primary.style,
      });
      alternate = createBuffer(size);
      alternateScreen = true;
      return;
    }
    alternate = undefined;
    alternateScreen = false;
    if (savedPrimaryCursor) {
      primary.cursorRow = clamp(savedPrimaryCursor.row, 0, size.rows - 1);
      primary.cursorColumn = clamp(
        savedPrimaryCursor.column,
        0,
        size.columns - 1
      );
      primary.style = savedPrimaryCursor.style;
    }
    savedPrimaryCursor = undefined;
  };

  const setPrivateMode = (
    parameters: readonly number[],
    enabled: boolean
  ): void => {
    parameters.forEach((value) => {
      if (value === 1) applicationCursorKeys = enabled;
      else if (value === 7) wraparound = enabled;
      else if (value === 25) cursorVisible = enabled;
      else if (value === 47 || value === 1047 || value === 1049)
        setAlternateScreen(enabled);
      else if (value === 2004) bracketedPaste = enabled;
    });
  };

  const insertLines = (count: number): void => {
    const buffer = activeBuffer();
    if (
      buffer.cursorRow < buffer.scrollTop ||
      buffer.cursorRow > buffer.scrollBottom
    )
      return;
    const normalized = clamp(
      count,
      1,
      buffer.scrollBottom - buffer.cursorRow + 1
    );
    buffer.lines.splice(
      buffer.cursorRow,
      0,
      ...Array.from({ length: normalized }, () => createLine(size.columns))
    );
    buffer.lines.splice(buffer.scrollBottom + 1, normalized);
  };

  const deleteLines = (count: number): void => {
    const buffer = activeBuffer();
    if (
      buffer.cursorRow < buffer.scrollTop ||
      buffer.cursorRow > buffer.scrollBottom
    )
      return;
    const normalized = clamp(
      count,
      1,
      buffer.scrollBottom - buffer.cursorRow + 1
    );
    buffer.lines.splice(buffer.cursorRow, normalized);
    buffer.lines.splice(
      buffer.scrollBottom - normalized + 1,
      0,
      ...Array.from({ length: normalized }, () => createLine(size.columns))
    );
  };

  const insertCharacters = (count: number): void => {
    const buffer = activeBuffer();
    const line = buffer.lines[buffer.cursorRow]!;
    const column = Math.min(buffer.cursorColumn, size.columns - 1);
    line.cells.splice(
      column,
      0,
      ...Array.from(
        { length: clamp(count, 1, size.columns - column) },
        () => undefined
      )
    );
    line.cells.length = size.columns;
  };

  const deleteCharacters = (count: number): void => {
    const buffer = activeBuffer();
    const line = buffer.lines[buffer.cursorRow]!;
    const column = Math.min(buffer.cursorColumn, size.columns - 1);
    const normalized = clamp(count, 1, size.columns - column);
    line.cells.splice(column, normalized);
    line.cells.push(...Array.from({ length: normalized }, () => undefined));
  };

  const eraseCharacters = (count: number): void => {
    const buffer = activeBuffer();
    const column = Math.min(buffer.cursorColumn, size.columns - 1);
    clearRange(
      buffer.lines[buffer.cursorRow]!,
      column,
      Math.min(size.columns - 1, column + count - 1)
    );
  };

  const handleControlSequence = (raw: string, final: string): void => {
    const privateMode = raw.startsWith('?');
    const parameterSource = privateMode ? raw.slice(1) : raw;
    if (!/^[\d;:]*$/u.test(parameterSource)) {
      discardedControlSequences += 1;
      return;
    }
    const parameters = parseParameters(parameterSource);
    const buffer = activeBuffer();
    if (final === 'A')
      buffer.cursorRow = Math.max(
        buffer.scrollTop,
        buffer.cursorRow - parameter(parameters, 0, 1)
      );
    else if (final === 'B')
      buffer.cursorRow = Math.min(
        buffer.scrollBottom,
        buffer.cursorRow + parameter(parameters, 0, 1)
      );
    else if (final === 'C')
      buffer.cursorColumn = Math.min(
        size.columns - 1,
        buffer.cursorColumn + parameter(parameters, 0, 1)
      );
    else if (final === 'D')
      buffer.cursorColumn = Math.max(
        0,
        buffer.cursorColumn - parameter(parameters, 0, 1)
      );
    else if (final === 'E') {
      buffer.cursorRow = Math.min(
        size.rows - 1,
        buffer.cursorRow + parameter(parameters, 0, 1)
      );
      buffer.cursorColumn = 0;
    } else if (final === 'F') {
      buffer.cursorRow = Math.max(
        0,
        buffer.cursorRow - parameter(parameters, 0, 1)
      );
      buffer.cursorColumn = 0;
    } else if (final === 'G' || final === '`')
      buffer.cursorColumn = clamp(
        parameter(parameters, 0, 1) - 1,
        0,
        size.columns - 1
      );
    else if (final === 'H' || final === 'f') {
      buffer.cursorRow = clamp(
        parameter(parameters, 0, 1) - 1,
        0,
        size.rows - 1
      );
      buffer.cursorColumn = clamp(
        parameter(parameters, 1, 1) - 1,
        0,
        size.columns - 1
      );
    } else if (final === 'd')
      buffer.cursorRow = clamp(
        parameter(parameters, 0, 1) - 1,
        0,
        size.rows - 1
      );
    else if (final === 'J') eraseDisplay(parameters[0] ?? 0);
    else if (final === 'K') eraseLine(parameters[0] ?? 0);
    else if (final === 'm') setStyle(parameters);
    else if (final === 'S') scrollUp(parameter(parameters, 0, 1));
    else if (final === 'T') scrollDown(parameter(parameters, 0, 1));
    else if (final === 'L') insertLines(parameter(parameters, 0, 1));
    else if (final === 'M') deleteLines(parameter(parameters, 0, 1));
    else if (final === '@') insertCharacters(parameter(parameters, 0, 1));
    else if (final === 'P') deleteCharacters(parameter(parameters, 0, 1));
    else if (final === 'X') eraseCharacters(parameter(parameters, 0, 1));
    else if (final === 'r') {
      const top = clamp(parameter(parameters, 0, 1) - 1, 0, size.rows - 1);
      const bottom = clamp(
        parameter(parameters, 1, size.rows) - 1,
        0,
        size.rows - 1
      );
      if (top < bottom) {
        buffer.scrollTop = top;
        buffer.scrollBottom = bottom;
        buffer.cursorRow = 0;
        buffer.cursorColumn = 0;
      }
    } else if (final === 's') saveCursor();
    else if (final === 'u') restoreCursor();
    else if ((final === 'h' || final === 'l') && privateMode)
      setPrivateMode(parameters, final === 'h');
    else if (!['c', 'n', 'q'].includes(final)) discardedControlSequences += 1;
  };

  const handleOperatingSystemCommand = (raw: string): void => {
    const separator = raw.indexOf(';');
    if (separator < 0) return;
    const command = raw.slice(0, separator);
    if (command !== '0' && command !== '2') return;
    const safe = redactExecutionConsoleText(raw.slice(separator + 1)).value;
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    title = [...safe.replace(/[\u0000-\u001f\u007f]/gu, '')]
      .slice(0, EXECUTION_TERMINAL_EMULATOR_LIMITS.maximumTitleCodeUnits)
      .join('');
  };

  const hardParserBoundary = (): void => {
    if (parserMode !== 'ground') discardedControlSequences += 1;
    parserMode = 'ground';
    parserValue = '';
    pendingStream = undefined;
  };

  const processCharacter = (character: string): void => {
    if (parserMode === 'ground') {
      if (character === '\u001b') {
        parserMode = 'escape';
        pendingStream = currentStream;
      } else if (character === '\u0007') bellCount += 1;
      else if (character === '\b') {
        const buffer = activeBuffer();
        buffer.cursorColumn = Math.max(0, buffer.cursorColumn - 1);
      } else if (character === '\t') {
        const buffer = activeBuffer();
        buffer.cursorColumn = Math.min(
          size.columns - 1,
          (Math.floor(buffer.cursorColumn / 8) + 1) * 8
        );
      } else if (character === '\n' || character === '\v' || character === '\f')
        lineFeed();
      else if (character === '\r') activeBuffer().cursorColumn = 0;
      else if ((character.codePointAt(0) ?? 0) >= 0x20)
        writeCharacter(character);
      return;
    }

    if (parserMode === 'escape') {
      if (character === '[') {
        parserMode = 'csi';
        parserValue = '';
      } else if (character === ']') {
        parserMode = 'osc';
        parserValue = '';
      } else if (character === 'P' || character === '_' || character === '^') {
        parserMode = 'ignored-string';
        parserValue = '';
      } else {
        parserMode = 'ground';
        pendingStream = undefined;
        if (character === '7') saveCursor();
        else if (character === '8') restoreCursor();
        else if (character === 'D') lineFeed();
        else if (character === 'E') {
          activeBuffer().cursorColumn = 0;
          lineFeed();
        } else if (character === 'M') reverseIndex();
        else if (character === 'c') {
          primary = createBuffer(size);
          alternate = undefined;
          alternateScreen = false;
          scrollback = [];
          cursorVisible = true;
          applicationCursorKeys = false;
          bracketedPaste = false;
          wraparound = true;
          title = undefined;
        } else discardedControlSequences += 1;
      }
      return;
    }

    if (parserMode === 'csi') {
      const codePoint = character.codePointAt(0) ?? 0;
      if (codePoint >= 0x40 && codePoint <= 0x7e) {
        handleControlSequence(parserValue, character);
        parserMode = 'ground';
        parserValue = '';
        pendingStream = undefined;
      } else if (
        codePoint >= 0x20 &&
        codePoint <= 0x3f &&
        parserValue.length <
          EXECUTION_TERMINAL_EMULATOR_LIMITS.maximumControlSequenceCodeUnits
      )
        parserValue += character;
      else hardParserBoundary();
      return;
    }

    if (parserMode === 'osc') {
      if (character === '\u0007') {
        handleOperatingSystemCommand(parserValue);
        parserMode = 'ground';
        parserValue = '';
        pendingStream = undefined;
      } else if (character === '\u001b') parserMode = 'osc-escape';
      else if (
        parserValue.length <
        EXECUTION_TERMINAL_EMULATOR_LIMITS.maximumOperatingSystemCommandCodeUnits
      )
        parserValue += character;
      else hardParserBoundary();
      return;
    }

    if (parserMode === 'osc-escape') {
      if (character === '\\') {
        handleOperatingSystemCommand(parserValue);
        parserMode = 'ground';
        parserValue = '';
        pendingStream = undefined;
      } else {
        parserMode = 'osc';
        if (
          parserValue.length + 2 <=
          EXECUTION_TERMINAL_EMULATOR_LIMITS.maximumOperatingSystemCommandCodeUnits
        )
          parserValue += `\u001b${character}`;
        else hardParserBoundary();
      }
      return;
    }

    if (parserMode === 'ignored-string') {
      if (character === '\u001b') parserMode = 'ignored-string-escape';
      return;
    }
    if (parserMode === 'ignored-string-escape') {
      if (character === '\\') {
        parserMode = 'ground';
        pendingStream = undefined;
      } else parserMode = 'ignored-string';
    }
  };

  const writeText = (
    value: string,
    stream: ExecutionTerminalOutputStream,
    forceBoundary = false
  ): void => {
    if (
      parserMode !== 'ground' &&
      pendingStream !== undefined &&
      pendingStream !== stream
    )
      hardParserBoundary();
    if (forceBoundary) hardParserBoundary();
    currentStream = stream;
    for (const character of value) processCharacter(character);
    if (forceBoundary) hardParserBoundary();
  };

  const projectGap = (): void => {
    gapCount += 1;
    gapAlreadyProjected = true;
    hardParserBoundary();
    writeText(`${EXECUTION_TERMINAL_TRUNCATION_MARKER}\r\n`, 'stderr', true);
  };

  const resizeBuffer = (
    buffer: TerminalBuffer,
    previous: ExecutionTerminalSize,
    next: ExecutionTerminalSize,
    retainRemoved: boolean
  ): void => {
    buffer.lines.forEach((line) => {
      if (next.columns < previous.columns) {
        const last = line.cells[next.columns - 1];
        if (last?.width === 0 && next.columns > 1)
          line.cells[next.columns - 2] = undefined;
        line.cells.length = next.columns;
      } else if (next.columns > previous.columns)
        line.cells.push(
          ...Array.from(
            { length: next.columns - previous.columns },
            () => undefined
          )
        );
    });
    while (buffer.lines.length > next.rows) {
      if (buffer.cursorRow >= next.rows) {
        const removed = buffer.lines.shift();
        if (removed && retainRemoved) retainScrollback(removed);
        buffer.cursorRow -= 1;
      } else buffer.lines.pop();
    }
    while (buffer.lines.length < next.rows)
      buffer.lines.push(createLine(next.columns));
    buffer.cursorRow = clamp(buffer.cursorRow, 0, next.rows - 1);
    buffer.cursorColumn = clamp(buffer.cursorColumn, 0, next.columns - 1);
    buffer.scrollTop = 0;
    buffer.scrollBottom = next.rows - 1;
  };

  const toPublicStyle = (
    style: ExecutionTerminalEmulatorStyle
  ): ExecutionTerminalEmulatorStyle => freezeStyle(style);

  const toPublicLine = (
    line: TerminalLine,
    index: number
  ): ExecutionTerminalEmulatorLine => {
    let lastColumn = -1;
    for (let column = line.cells.length - 1; column >= 0; column -= 1) {
      const cell = line.cells[column];
      if (cell && cell.width !== 0) {
        lastColumn = column + (cell.width === 2 ? 1 : 0);
        break;
      }
    }
    const runs: ExecutionTerminalEmulatorRun[] = [];
    let runText = '';
    let runStyle = DEFAULT_STYLE;
    let runStream: ExecutionTerminalOutputStream = 'stdout';
    const flush = (): void => {
      if (!runText) return;
      runs.push(
        Object.freeze({
          text: runText,
          stream: runStream,
          style: toPublicStyle(runStyle),
        })
      );
      runText = '';
    };
    for (let column = 0; column <= lastColumn; column += 1) {
      const cell = line.cells[column];
      if (cell?.width === 0) continue;
      const text = cell
        ? cell.style.hidden
          ? ' '.repeat(Math.max(1, cell.width))
          : cell.text
        : ' ';
      const style = cell?.style ?? DEFAULT_STYLE;
      const stream = cell?.stream ?? 'stdout';
      if (runText && (!styleEquals(runStyle, style) || runStream !== stream))
        flush();
      if (!runText) {
        runStyle = style;
        runStream = stream;
      }
      runText += text;
    }
    flush();
    const text = runs.map((run) => run.text).join('');
    return Object.freeze({
      index,
      text,
      wrapped: line.wrapped,
      runs: Object.freeze(runs),
    });
  };

  const getSnapshot = (): ExecutionTerminalEmulatorSnapshot => {
    const buffer = activeBuffer();
    const sourceLines = alternateScreen
      ? buffer.lines
      : [...scrollback, ...buffer.lines];
    const publicLines = Object.freeze(sourceLines.map(toPublicLine));
    const screenStartLine = alternateScreen ? 0 : scrollback.length;
    return Object.freeze({
      size,
      lines: publicLines,
      screenStartLine,
      cursor: Object.freeze({
        line: screenStartLine + buffer.cursorRow,
        column: clamp(buffer.cursorColumn, 0, size.columns - 1),
        visible: cursorVisible,
      }),
      ...(title !== undefined ? { title } : {}),
      latestOutputCursor,
      ...(terminalSessionId ? { terminalSessionId } : {}),
      ...(executionId ? { executionId } : {}),
      ...(jobId ? { jobId } : {}),
      modes: Object.freeze({
        alternateScreen,
        applicationCursorKeys,
        bracketedPaste,
        wraparound,
      }),
      metrics: Object.freeze({
        processedRecords,
        gapCount,
        redactedRecords,
        truncatedRecords,
        bellCount,
        discardedControlSequences,
      }),
    });
  };

  const reset = (nextSize = initialSize): ExecutionTerminalEmulatorSnapshot => {
    size = normalizeSize(nextSize);
    primary = createBuffer(size);
    alternate = undefined;
    alternateScreen = false;
    savedPrimaryCursor = undefined;
    scrollback = [];
    parserMode = 'ground';
    parserValue = '';
    pendingStream = undefined;
    currentStream = 'stdout';
    cursorVisible = true;
    applicationCursorKeys = false;
    bracketedPaste = false;
    wraparound = true;
    title = undefined;
    latestOutputCursor = 0;
    terminalSessionId = undefined;
    executionId = undefined;
    jobId = undefined;
    gapAlreadyProjected = false;
    processedRecords = 0;
    gapCount = 0;
    redactedRecords = 0;
    truncatedRecords = 0;
    bellCount = 0;
    discardedControlSequences = 0;
    return getSnapshot();
  };

  const resize = (
    nextSizeInput: ExecutionTerminalSize
  ): ExecutionTerminalEmulatorSnapshot => {
    const nextSize = normalizeSize(nextSizeInput);
    if (nextSize.columns === size.columns && nextSize.rows === size.rows)
      return getSnapshot();
    const previous = size;
    size = nextSize;
    resizeBuffer(primary, previous, nextSize, true);
    if (alternate) resizeBuffer(alternate, previous, nextSize, false);
    return getSnapshot();
  };

  const consume = (
    consumeInput: Readonly<{
      records: readonly ExecutionTerminalOutputRecord[];
      gap?: boolean;
    }>
  ): ExecutionTerminalEmulatorSnapshot => {
    if (consumeInput.gap && !gapAlreadyProjected) projectGap();
    for (const record of consumeInput.records) {
      if (!Number.isSafeInteger(record.cursor) || record.cursor <= 0)
        throw new TypeError(
          'Execution terminal emulator output cursor must be a positive safe integer.'
        );
      if (record.cursor <= latestOutputCursor) continue;
      if (
        terminalSessionId !== undefined &&
        (record.terminalSessionId !== terminalSessionId ||
          record.executionId !== executionId ||
          record.jobId !== jobId)
      )
        throw new TypeError(
          'Execution terminal emulator output identity must remain exact.'
        );
      if (utf8ToBytes(record.data).byteLength !== record.byteLength)
        throw new TypeError(
          'Execution terminal emulator output byte length must remain exact.'
        );
      if (record.byteLength > EXECUTION_TERMINAL_LIMITS.maximumOutputChunkBytes)
        throw new TypeError(
          'Execution terminal emulator output exceeds the chunk budget.'
        );
      if (terminalSessionId === undefined) {
        terminalSessionId = record.terminalSessionId;
        executionId = record.executionId;
        jobId = record.jobId;
      }
      if (
        record.cursor > latestOutputCursor + 1 &&
        (latestOutputCursor > 0 || !gapAlreadyProjected)
      )
        projectGap();
      latestOutputCursor = record.cursor;
      processedRecords += 1;
      if (record.redacted) redactedRecords += 1;
      if (record.truncated) truncatedRecords += 1;
      const safe = redactExecutionConsoleText(record.data);
      writeText(
        safe.value,
        record.stream,
        record.redacted || record.truncated || safe.redacted
      );
    }
    return getSnapshot();
  };

  return Object.freeze({ consume, resize, reset, getSnapshot });
};

/** Copies the rendered screen/scrollback, never raw ANSI or PTY bytes. */
export const createExecutionTerminalEmulatorCopyText = (
  snapshot: ExecutionTerminalEmulatorSnapshot,
  maximumBytes = EXECUTION_TERMINAL_LIMITS.maximumCopyBytes
): string => {
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes <= 0 ||
    maximumBytes > EXECUTION_TERMINAL_LIMITS.maximumCopyBytes
  )
    throw new TypeError(
      'Execution terminal emulator copy byte budget is invalid.'
    );
  const lines = snapshot.lines.map((line) => line.text.replace(/\s+$/u, ''));
  while (lines.length && lines.at(-1) === '') lines.pop();
  const redacted = redactExecutionConsoleText(lines.join('\n')).value;
  return truncateUtf8(redacted, maximumBytes).value;
};
