import './PdxPagination.scss';
import {
  getDataAttributes,
  mergeClassNames,
  type PdxNativeProps,
} from '../foundation/component';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { forwardRef } from 'react';

type PaginationItem = number | 'EllipsisLeft' | 'EllipsisRight';

export interface PdxPaginationOwnProps {
  disabled?: boolean;
  maxButtons?: number;
  navigationLabel?: string;
  nextLabel?: string;
  onPageChange?: (page: number) => void;
  page: number;
  pageLabel?: (page: number) => string;
  pageSize?: number;
  previousLabel?: string;
  total: number;
}

export type PdxPaginationProps = Omit<PdxNativeProps<'nav'>, 'children'> &
  PdxPaginationOwnProps;

function createPaginationItems(
  currentPage: number,
  totalPages: number,
  requestedMaximum: number
): PaginationItem[] {
  const maximum = Math.max(5, requestedMaximum);
  if (totalPages <= maximum) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const edgeCount = maximum - 3;
  if (currentPage <= edgeCount) {
    return [
      ...Array.from({ length: maximum - 2 }, (_, index) => index + 1),
      'EllipsisRight',
      totalPages,
    ];
  }

  if (currentPage >= totalPages - edgeCount + 1) {
    return [
      1,
      'EllipsisLeft',
      ...Array.from(
        { length: maximum - 2 },
        (_, index) => totalPages - maximum + 3 + index
      ),
    ];
  }

  const middleCount = maximum - 4;
  const middleStart = currentPage - Math.floor(middleCount / 2);
  return [
    1,
    'EllipsisLeft',
    ...Array.from({ length: middleCount }, (_, index) => middleStart + index),
    'EllipsisRight',
    totalPages,
  ];
}

/**
 * The edge buttons stay in the tab order and declare `aria-disabled` rather
 * than using the `disabled` attribute: paging to the last page would otherwise
 * destroy the focus the user was navigating with, and the reason they can go no
 * further would never be announced.
 */
const PdxPagination = forwardRef<HTMLElement, PdxPaginationProps>(
  function PdxPagination(
    {
      className,
      dataAttributes,
      disabled = false,
      maxButtons = 7,
      navigationLabel = 'Pagination',
      nextLabel = 'Next page',
      onPageChange,
      page,
      pageLabel = (pageNumber) => `Go to page ${pageNumber}`,
      pageSize = 10,
      previousLabel = 'Previous page',
      total,
      ...rest
    },
    ref
  ) {
    const normalizedPageSize = Math.max(1, pageSize);
    const totalPages = Math.max(
      1,
      Math.ceil(Math.max(0, total) / normalizedPageSize)
    );
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const items = createPaginationItems(currentPage, totalPages, maxButtons);
    const atFirstPage = disabled || currentPage === 1;
    const atLastPage = disabled || currentPage === totalPages;

    const changePage = (nextPage: number) => {
      if (
        disabled ||
        nextPage === currentPage ||
        nextPage < 1 ||
        nextPage > totalPages
      ) {
        return;
      }
      onPageChange?.(nextPage);
    };

    return (
      <nav
        {...rest}
        {...getDataAttributes(dataAttributes)}
        aria-label={navigationLabel}
        className={mergeClassNames('PdxPagination', className)}
        ref={ref}
      >
        <button
          aria-disabled={atFirstPage || undefined}
          aria-label={previousLabel}
          className="PdxPaginationButton PdxPaginationDirection"
          onClick={() => changePage(currentPage - 1)}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={15} />
          <span className="PdxPaginationDirectionLabel">{previousLabel}</span>
        </button>
        <ol className="PdxPaginationPages">
          {items.map((item) =>
            typeof item === 'number' ? (
              <li key={item}>
                <button
                  aria-current={item === currentPage ? 'page' : undefined}
                  aria-disabled={disabled || undefined}
                  aria-label={pageLabel(item)}
                  className="PdxPaginationButton PdxPaginationPage"
                  onClick={() => changePage(item)}
                  type="button"
                >
                  {item}
                </button>
              </li>
            ) : (
              <li
                aria-hidden="true"
                className="PdxPaginationEllipsis"
                key={item}
              >
                …
              </li>
            )
          )}
        </ol>
        <button
          aria-disabled={atLastPage || undefined}
          aria-label={nextLabel}
          className="PdxPaginationButton PdxPaginationDirection"
          onClick={() => changePage(currentPage + 1)}
          type="button"
        >
          <span className="PdxPaginationDirectionLabel">{nextLabel}</span>
          <ChevronRight aria-hidden="true" size={15} />
        </button>
      </nav>
    );
  }
);

export default PdxPagination;
