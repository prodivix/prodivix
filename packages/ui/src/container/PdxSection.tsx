import './PdxSection.scss';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

interface PdxSectionSpecificProps {
  children: React.ReactNode;
  size?: 'Small' | 'Medium' | 'Large';
  backgroundColor?: 'Default' | 'Light' | 'Dark' | 'Primary' | 'Secondary';
  padding?: 'None' | 'Small' | 'Medium' | 'Large';
  textAlign?: 'Left' | 'Center' | 'Right';
  fullWidth?: boolean;
}

export interface PdxSectionProps
  extends PdxComponent,
    PdxSectionSpecificProps {}

function PdxSection({
  children,
  size = 'Medium',
  backgroundColor = 'Default',
  padding = 'Medium',
  textAlign = 'Left',
  fullWidth = false,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxSectionProps) {
  const fullClassName =
    `PdxSection ${size} ${backgroundColor} Padding${padding} ${textAlign} ${fullWidth ? 'FullWidth' : ''} ${className || ''}`.trim();

  const dataProps = { ...dataAttributes };

  return (
    <section
      className={fullClassName}
      style={style as React.CSSProperties}
      id={id}
      {...dataProps}
    >
      {children}
    </section>
  );
}

export default PdxSection;
