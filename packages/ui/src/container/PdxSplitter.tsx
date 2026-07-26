import './PdxSplitter.scss';
import {
  assignRef,
  getDataAttributes,
  mergeClassNames,
  type PdxNativeProps,
} from '../foundation/component';
import { useControllableState } from '../foundation/useControllableState';
import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';

export interface PdxSplitterPane {
  /** Stable identity of the pane. */
  key: string;
  content: ReactNode;
  /** Names the pane so its divider gets a meaningful accessible name. */
  label?: string;
  /** Overrides the derived accessible name of the divider after this pane. */
  resizeLabel?: string;
  /** Pixel size this pane starts at while uncontrolled. Unused on the last pane. */
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
}

/** The axis the panes are laid out along, not the axis of the divider line. */
export type PdxSplitterOrientation = 'Horizontal' | 'Vertical';

export interface PdxSplitterOwnProps {
  panes: PdxSplitterPane[];
  orientation?: PdxSplitterOrientation;
  /**
   * Pixel sizes of the leading panes — `panes.length - 1` entries, because the
   * final pane always absorbs whatever space is left.
   */
  sizes?: number[];
  defaultSizes?: number[];
  onSizesChange?: (sizes: number[]) => void;
  /** Pixels an arrow key moves the divider. Shift multiplies it. */
  keyboardStep?: number;
}

export type PdxSplitterProps = Omit<PdxNativeProps<'div'>, 'children'> &
  PdxSplitterOwnProps;

const DEFAULT_PANE_SIZE = 240;
const DEFAULT_KEYBOARD_STEP = 16;
const LARGE_STEP_MULTIPLIER = 4;

const initialPaneSize = (pane: PdxSplitterPane) =>
  pane.defaultSize ?? pane.minSize ?? DEFAULT_PANE_SIZE;

const resolveInitialSizes = (
  panes: PdxSplitterPane[],
  defaultSizes: number[] | undefined
) =>
  panes
    .slice(0, -1)
    .map((pane, index) => defaultSizes?.[index] ?? initialPaneSize(pane));

/**
 * Resizable panes with a real separator.
 *
 * `sizes[i]` is the pixel size of pane `i`; divider `i` sits after it and the
 * last pane takes the remainder, so every divider owns exactly one number and
 * `aria-valuenow` can report it truthfully. Both the pointer and the arrow keys
 * drive the same clamped `applySize`, which is why a drag-only splitter — the
 * usual failure — cannot happen here: the keyboard is not a second code path.
 */
const PdxSplitter = forwardRef<HTMLDivElement, PdxSplitterProps>(
  function PdxSplitter(
    {
      className,
      dataAttributes,
      defaultSizes,
      keyboardStep = DEFAULT_KEYBOARD_STEP,
      onSizesChange,
      orientation = 'Horizontal',
      panes,
      sizes,
      ...rest
    },
    ref
  ) {
    const baseId = useId().replaceAll(':', '');
    const isHorizontal = orientation === 'Horizontal';
    const containerRef = useRef<HTMLDivElement | null>(null);
    const dividerRefs = useRef(new Map<number, HTMLDivElement>());
    const dragRef = useRef<{
      index: number;
      pointerId: number;
      startCoordinate: number;
      startSize: number;
    } | null>(null);
    const restoreSizes = useRef(new Map<number, number>());
    const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
    const [contentExtent, setContentExtent] = useState(0);

    const [requestedSizes, setRequestedSizes] = useControllableState<number[]>({
      value: sizes,
      defaultValue: resolveInitialSizes(panes, defaultSizes),
      onChange: onSizesChange,
    });

    const resolvedSizes = panes.slice(0, -1).map((pane, index) => {
      const size = requestedSizes.at(index);
      return size !== undefined && Number.isFinite(size)
        ? size
        : initialPaneSize(pane);
    });

    // Space the panes can actually share, i.e. the container minus the dividers.
    // Measured rather than assumed so `aria-valuemax` reports a real bound.
    const measure = useCallback(() => {
      const node = containerRef.current;
      if (!node) return;

      const rect = node.getBoundingClientRect();
      let dividerExtent = 0;
      dividerRefs.current.forEach((divider) => {
        const dividerRect = divider.getBoundingClientRect();
        dividerExtent += isHorizontal ? dividerRect.width : dividerRect.height;
      });

      setContentExtent(
        Math.max(0, (isHorizontal ? rect.width : rect.height) - dividerExtent)
      );
    }, [isHorizontal]);

    useEffect(() => {
      measure();
      const node = containerRef.current;
      if (!node || typeof ResizeObserver === 'undefined') return;

      const observer = new ResizeObserver(measure);
      observer.observe(node);
      return () => observer.disconnect();
    }, [measure, panes.length]);

    const boundsFor = (index: number) => {
      const pane = panes[index];
      const min = Math.max(0, pane?.minSize ?? 0);
      let max = pane?.maxSize ?? Number.POSITIVE_INFINITY;

      if (contentExtent > 0) {
        const otherLeading = resolvedSizes.reduce(
          (total, size, otherIndex) =>
            otherIndex === index ? total : total + size,
          0
        );
        const lastPaneMin = panes.at(-1)?.minSize ?? 0;
        max = Math.min(max, contentExtent - otherLeading - lastPaneMin);
      }

      return { min, max: Math.max(min, max) };
    };

    /**
     * `aria-valuemax` has to be a number, but a pane with no declared maximum
     * inside a container that has not been laid out yet has no knowable ceiling.
     * Reporting the current size is the only honest answer — and because it is
     * only a report, it never becomes a clamp that would freeze the divider.
     */
    const reportableMax = (index: number, max: number, min: number) =>
      Number.isFinite(max)
        ? max
        : Math.max(min, resolvedSizes.at(index) ?? min);

    const applySize = (index: number, nextSize: number) => {
      const { min, max } = boundsFor(index);
      const clamped = Math.round(Math.min(max, Math.max(min, nextSize)));
      if (clamped === resolvedSizes.at(index)) return;

      setRequestedSizes(
        resolvedSizes.map((size, other) => (other === index ? clamped : size))
      );
    };

    const toggleCollapse = (index: number) => {
      const { min, max } = boundsFor(index);
      const current = resolvedSizes.at(index) ?? min;

      if (current > min) {
        restoreSizes.current.set(index, current);
        applySize(index, min);
        return;
      }

      applySize(
        index,
        restoreSizes.current.get(index) ?? Math.min(max, DEFAULT_PANE_SIZE)
      );
    };

    const handlePointerDown = (
      event: PointerEvent<HTMLDivElement>,
      index: number
    ) => {
      if (event.button !== 0) return;

      // Capture keeps a fast drag bound to the divider: without it the pointer
      // outruns the element, the moves land on whatever is underneath, and the
      // divider desyncs from the cursor.
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.focus();
      event.preventDefault();

      dragRef.current = {
        index,
        pointerId: event.pointerId,
        startCoordinate: isHorizontal ? event.clientX : event.clientY,
        startSize: resolvedSizes.at(index) ?? 0,
      };
      setDraggingIndex(index);
    };

    const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const coordinate = isHorizontal ? event.clientX : event.clientY;
      applySize(drag.index, drag.startSize + coordinate - drag.startCoordinate);
    };

    const endDrag = (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      dragRef.current = null;
      setDraggingIndex(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    };

    const handleKeyDown = (
      event: KeyboardEvent<HTMLDivElement>,
      index: number
    ) => {
      const { min, max } = boundsFor(index);
      const current = resolvedSizes.at(index) ?? min;
      const step = event.shiftKey
        ? keyboardStep * LARGE_STEP_MULTIPLIER
        : keyboardStep;
      const decreaseKey = isHorizontal ? 'ArrowLeft' : 'ArrowUp';
      const increaseKey = isHorizontal ? 'ArrowRight' : 'ArrowDown';

      switch (event.key) {
        case decreaseKey:
          applySize(index, current - step);
          break;
        case increaseKey:
          applySize(index, current + step);
          break;
        case 'Home':
          applySize(index, min);
          break;
        case 'End':
          applySize(index, reportableMax(index, max, min));
          break;
        case 'Enter':
          toggleCollapse(index);
          break;
        default:
          return;
      }

      event.preventDefault();
    };

    const renderDivider = (index: number, pane: PdxSplitterPane) => {
      const { min, max } = boundsFor(index);

      return (
        <div
          aria-controls={`${baseId}-pane-${index}`}
          aria-label={
            pane.resizeLabel ??
            (pane.label ? `Resize ${pane.label}` : `Resize pane ${index + 1}`)
          }
          aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
          aria-valuemax={Math.round(reportableMax(index, max, min))}
          aria-valuemin={Math.round(min)}
          aria-valuenow={Math.round(resolvedSizes.at(index) ?? min)}
          className="PdxSplitterDivider"
          data-pdx-dragging={draggingIndex === index ? 'true' : undefined}
          onKeyDown={(event) => handleKeyDown(event, index)}
          onLostPointerCapture={endDrag}
          onPointerCancel={endDrag}
          onPointerDown={(event) => handlePointerDown(event, index)}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          ref={(node) => {
            if (node) dividerRefs.current.set(index, node);
            else dividerRefs.current.delete(index);
          }}
          role="separator"
          tabIndex={0}
        />
      );
    };

    return (
      <div
        {...rest}
        {...getDataAttributes(dataAttributes)}
        className={mergeClassNames('PdxSplitter', orientation, className)}
        data-pdx-dragging={draggingIndex === null ? undefined : 'true'}
        ref={(node) => {
          containerRef.current = node;
          assignRef(ref, node);
        }}
      >
        {panes.map((pane, index) => {
          const isLast = index === panes.length - 1;

          return (
            <Fragment key={pane.key}>
              <div
                className="PdxSplitterPane"
                id={`${baseId}-pane-${index}`}
                style={
                  {
                    flex: isLast
                      ? '1 1 0%'
                      : `0 0 ${resolvedSizes.at(index) ?? 0}px`,
                  } satisfies CSSProperties
                }
              >
                {pane.content}
              </div>
              {!isLast && renderDivider(index, pane)}
            </Fragment>
          );
        })}
      </div>
    );
  }
);

export default PdxSplitter;
