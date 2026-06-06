import './PdxPagination.scss';
import { type PdxComponent } from '@prodivix/shared';

interface PdxPaginationSpecificProps {
  page: number;
  total: number;
  pageSize?: number;
  maxButtons?: number;
  onChange?: (page: number) => void;
}

export interface PdxPaginationProps
  extends PdxComponent,
    PdxPaginationSpecificProps {}

function PdxPagination({
  page,
  total,
  pageSize = 10,
  maxButtons = 5,
  onChange,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const half = Math.floor(maxButtons / 2);
  let start = Math.max(1, currentPage - half);
  let end = Math.min(totalPages, start + maxButtons - 1);
  start = Math.max(1, end - maxButtons + 1);

  const pages = Array.from(
    { length: end - start + 1 },
    (_, index) => start + index
  );

  const handleChange = (nextPage: number) => {
    if (nextPage < 1 || nextPage > totalPages) return;
    if (onChange) {
      onChange(nextPage);
    }
  };

  const fullClassName = `PdxPagination ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  return (
    <div
      className={fullClassName}
      style={style as React.CSSProperties}
      id={id}
      {...dataProps}
    >
      <button
        type="button"
        onClick={() => handleChange(currentPage - 1)}
        disabled={currentPage === 1}
      >
        Prev
      </button>
      {pages.map((pageNumber) => (
        <button
          key={pageNumber}
          type="button"
          className={pageNumber === currentPage ? 'Active' : ''}
          onClick={() => handleChange(pageNumber)}
        >
          {pageNumber}
        </button>
      ))}
      <button
        type="button"
        onClick={() => handleChange(currentPage + 1)}
        disabled={currentPage === totalPages}
      >
        Next
      </button>
    </div>
  );
}

export default PdxPagination;
