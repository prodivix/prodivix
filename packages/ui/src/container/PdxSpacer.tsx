import './PdxSpacer.scss';
import { getDataAttributes, mergeClassNames } from '../foundation/component';
import { type PdxSpacingScale } from './PdxStack';
import { type PdxComponent } from '@prodivix/shared';

export type PdxSpacerAxis = 'Horizontal' | 'Vertical' | 'Both';

interface PdxSpacerSpecificProps {
  axis?: PdxSpacerAxis;
  flexible?: boolean;
  size?: PdxSpacingScale;
}

export interface PdxSpacerProps extends PdxComponent, PdxSpacerSpecificProps {}

/**
 * Space with no content. It is hidden from assistive technology because an
 * empty box is layout, never information.
 */
function PdxSpacer({
  axis = 'Vertical',
  flexible = false,
  size = 'Medium',
  as,
  className,
  style,
  id,
  dataAttributes = {},
  onClick,
}: PdxSpacerProps) {
  const Component = as ?? 'span';

  return (
    <Component
      aria-hidden="true"
      className={mergeClassNames(
        'PdxSpacer',
        axis,
        flexible ? 'Flexible' : `Size${size}`,
        className
      )}
      id={id}
      onClick={onClick}
      style={style}
      {...getDataAttributes(dataAttributes)}
    />
  );
}

export default PdxSpacer;
