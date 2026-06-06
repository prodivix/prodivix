import React from 'react';
import { type To } from 'react-router';
import PdxIcon, { type PdxIconProps } from '../icon/PdxIcon';
import PdxLink from '../link/PdxLink';
import './PdxIconLink.scss';

export interface PdxIconLinkSpecificProps
  extends PdxIconProps,
    React.RefAttributes<HTMLAnchorElement> {
  to: To;
  replace?: boolean;
  state?: unknown;
}

function PdxIconLink(props: PdxIconLinkSpecificProps) {
  const { to, title, ...iconProps } = props;
  return (
    <PdxLink className="PdxIconLink" to={to} title={title}>
      <PdxIcon {...iconProps} title={title} />
    </PdxLink>
  );
}

export default PdxIconLink;
