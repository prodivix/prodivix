import React from 'react';
import { type To } from 'react-router';
import PdxButton, { type PdxButtonProps } from './PdxButton';
import PdxLink from '../link/PdxLink';

export interface PdxButtonLinkSpecificProps
  extends PdxButtonProps,
    React.RefAttributes<HTMLAnchorElement> {
  to: To;
  replace?: boolean;
  state?: unknown;
}

function PdxButtonLink(props: PdxButtonLinkSpecificProps) {
  return (
    <PdxLink className="PdxButtonLink" to={props.to} disabled={props.disabled}>
      <PdxButton {...props} />
    </PdxLink>
  );
}

export default PdxButtonLink;
