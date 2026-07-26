import './PdxIframe.scss';
import {
  filterFramePassThroughProps,
  resolveFrameSandbox,
  resolveSafeFrameSrc,
} from './embedFrameSafety';
import { getDataAttributes, mergeClassNames } from '../foundation/component';
import {
  enumValueToKebabCase,
  getAspectRatioStyle,
  type PdxAspectRatio,
} from '../foundation/media';
import React from 'react';
import type { PdxComponent } from '@prodivix/shared';

interface PdxIframeSpecificProps {
  src?: string;
  /** Inline document markup. Only rendered when `allowInlineDocument` is set, and always inside a sandbox without `allow-same-origin`. */
  srcDoc?: string;
  /** Explicit opt-in required before an inline `srcDoc` document is rendered at all. */
  allowInlineDocument?: boolean;
  title?: string;
  allow?: string;
  allowFullScreen?: boolean;
  loading?: 'Eager' | 'Lazy';
  referrerPolicy?:
    | 'NoReferrer'
    | 'NoReferrerWhenDowngrade'
    | 'Origin'
    | 'OriginWhenCrossOrigin'
    | 'SameOrigin'
    | 'StrictOrigin'
    | 'StrictOriginWhenCrossOrigin'
    | 'UnsafeUrl';
  sandbox?: string;
  width?: number | string;
  height?: number | string;
  aspectRatio?: PdxAspectRatio;
}

type PdxIframeNativeProps = Omit<
  React.IframeHTMLAttributes<HTMLIFrameElement>,
  | 'width'
  | 'height'
  | 'loading'
  | 'referrerPolicy'
  | 'src'
  | 'srcDoc'
  | 'children'
  | 'dangerouslySetInnerHTML'
  | 'title'
  | 'allow'
  | 'allowFullScreen'
  | 'sandbox'
  | 'className'
  | 'style'
  | 'id'
  | 'onClick'
  | 'onLoad'
  | 'onError'
>;

export interface PdxIframeProps
  extends
    Omit<PdxComponent, 'as'>,
    PdxIframeSpecificProps,
    PdxIframeNativeProps {
  onLoad?: React.ReactEventHandler<HTMLIFrameElement>;
  onError?: React.ReactEventHandler<HTMLIFrameElement>;
}

/**
 * Author-controlled iframe. `src` is resolved through the shared embed URL policy and
 * the sandbox is always emitted, so neither a hostile `srcDoc` nor an embedder-origin
 * `src` can reach the editor document. See `embedFrameSafety` for the invariants.
 */
function PdxIframe({
  src,
  srcDoc,
  allowInlineDocument = false,
  title,
  allow,
  allowFullScreen = false,
  loading = 'Lazy',
  referrerPolicy,
  sandbox,
  width,
  height,
  aspectRatio = '16:9',
  className,
  style,
  id,
  dataAttributes = {},
  onLoad,
  onError,
  onClick,
  ...rest
}: PdxIframeProps) {
  const fullClassName = mergeClassNames(
    'PdxIframe',
    `aspect-${aspectRatio.replace(':', '-')}`,
    height !== undefined && 'HasExplicitHeight',
    className
  );

  const containerStyle: React.CSSProperties = {
    ...getAspectRatioStyle(aspectRatio),
    ...(style as React.CSSProperties | undefined),
    width: width ?? style?.width ?? '100%',
    ...(height !== undefined ? { height } : {}),
  };

  const inlineDocument =
    allowInlineDocument && srcDoc !== undefined ? srcDoc : undefined;
  const frameSrc = resolveSafeFrameSrc('Custom', src);
  const frameSandbox = resolveFrameSandbox({
    requested: sandbox,
    src: frameSrc,
    inlineDocument: inlineDocument !== undefined,
  });
  const iframeProps = filterFramePassThroughProps(
    rest
  ) as React.IframeHTMLAttributes<HTMLIFrameElement>;

  return (
    <div
      className={fullClassName}
      id={id}
      onClick={onClick}
      style={containerStyle}
      {...getDataAttributes(dataAttributes)}
    >
      <div className="PdxIframeFrame">
        <iframe
          allow={allow}
          allowFullScreen={allowFullScreen}
          className="PdxIframeElement"
          loading={loading.toLowerCase() as 'eager' | 'lazy'}
          referrerPolicy={
            referrerPolicy
              ? (enumValueToKebabCase(
                  referrerPolicy
                ) as React.IframeHTMLAttributes<HTMLIFrameElement>['referrerPolicy'])
              : undefined
          }
          sandbox={frameSandbox}
          onError={onError}
          onLoad={onLoad}
          src={inlineDocument === undefined ? frameSrc : undefined}
          srcDoc={inlineDocument}
          title={title || 'Embedded content'}
          {...iframeProps}
        />
      </div>
    </div>
  );
}

export default PdxIframe;
