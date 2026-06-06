import './PdxStatistic.scss';
import { type PdxComponent } from '@prodivix/shared';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type React from 'react';

interface PdxStatisticSpecificProps {
  title?: string;
  value: number | string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  trend?: 'Up' | 'Down';
  precision?: number;
  color?: string;
}

export interface PdxStatisticProps
  extends PdxComponent,
    PdxStatisticSpecificProps {}

function PdxStatistic({
  title,
  value,
  prefix,
  suffix,
  trend,
  precision,
  color,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxStatisticProps) {
  const formattedValue =
    typeof value === 'number' && precision !== undefined
      ? value.toFixed(precision)
      : value;

  const fullClassName = `PdxStatistic ${trend || ''} ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  return (
    <div
      className={fullClassName}
      style={style as React.CSSProperties}
      id={id}
      {...dataProps}
    >
      {title && <div className="PdxStatisticTitle">{title}</div>}
      <div className="PdxStatisticValue" style={color ? { color } : undefined}>
        {trend && (
          <span className="PdxStatisticTrend">
            {trend === 'Up' ? (
              <TrendingUp className="PdxStatisticTrendIcon" />
            ) : (
              <TrendingDown className="PdxStatisticTrendIcon" />
            )}
          </span>
        )}
        {prefix && <span className="PdxStatisticPrefix">{prefix}</span>}
        <span className="PdxStatisticNumber">{formattedValue}</span>
        {suffix && <span className="PdxStatisticSuffix">{suffix}</span>}
      </div>
    </div>
  );
}

export default PdxStatistic;
