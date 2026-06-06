import './PdxParagraph.scss';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

interface PdxParagraphSpecificProps {
  children: React.ReactNode;
  size?: 'Small' | 'Medium' | 'Large';
  weight?: 'Light' | 'Normal' | 'Medium' | 'SemiBold';
  color?:
    | 'Default'
    | 'Muted'
    | 'Primary'
    | 'Secondary'
    | 'Danger'
    | 'Warning'
    | 'Success';
  align?: 'Left' | 'Center' | 'Right';
}

export interface PdxParagraphProps
  extends PdxComponent,
    PdxParagraphSpecificProps {}

function PdxParagraph({
  children,
  size = 'Medium',
  weight = 'Normal',
  color = 'Default',
  align = 'Left',
  as: Component = 'p',
  className,
  style,
  id,
  dataAttributes = {},
}: PdxParagraphProps) {
  const fullClassName =
    `PdxParagraph ${size} ${weight} ${color} ${align} ${className || ''}`.trim();

  const dataProps = { ...dataAttributes };

  const Element = Component as React.ElementType;

  return (
    <Element className={fullClassName} style={style} id={id} {...dataProps}>
      {children}
    </Element>
  );
}

export default PdxParagraph;
