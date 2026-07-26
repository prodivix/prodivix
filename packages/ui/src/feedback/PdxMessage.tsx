import './PdxMessage.scss';
import {
  getDataAttributes,
  mergeClassNames,
  type PdxNativeProps,
} from '../foundation/component';
import {
  PDX_FEEDBACK_ICONS,
  PDX_FEEDBACK_TYPE_LABELS,
  resolveFeedbackLiveness,
  resolveFeedbackRole,
  type PdxFeedbackType,
} from './feedbackType';
import { X } from 'lucide-react';
import { forwardRef, type ReactNode } from 'react';

export type { PdxFeedbackType };

export interface PdxMessageOwnProps {
  closable?: boolean;
  closeLabel?: string;
  icon?: ReactNode;
  onClose?: () => void;
  showIcon?: boolean;
  text: ReactNode;
  type?: PdxFeedbackType;
  /** Spoken type name. `null` drops it when surrounding copy already says so. */
  typeLabel?: string | null;
}

export type PdxMessageProps = Omit<PdxNativeProps<'div'>, 'children'> &
  PdxMessageOwnProps;

/**
 * A message announces itself and never takes focus: it is a live region the
 * reader is told about while their cursor stays where it was.
 */
const PdxMessage = forwardRef<HTMLDivElement, PdxMessageProps>(
  function PdxMessage(
    {
      'aria-atomic': ariaAtomic,
      'aria-live': ariaLive,
      className,
      closable = false,
      closeLabel = 'Dismiss message',
      dataAttributes,
      icon,
      onClose,
      role,
      showIcon = true,
      text,
      type = 'Info',
      typeLabel,
      ...rest
    },
    ref
  ) {
    const MessageIcon = PDX_FEEDBACK_ICONS[type];
    const resolvedRole = role ?? resolveFeedbackRole(type);
    const spokenType =
      typeLabel === undefined ? PDX_FEEDBACK_TYPE_LABELS[type] : typeLabel;

    return (
      <div
        {...rest}
        {...getDataAttributes(dataAttributes)}
        aria-atomic={ariaAtomic ?? true}
        aria-live={ariaLive ?? resolveFeedbackLiveness(resolvedRole)}
        className={mergeClassNames('PdxMessage', type, className)}
        ref={ref}
        role={resolvedRole}
      >
        {spokenType ? (
          <span className="PdxMessageType">{spokenType}</span>
        ) : null}
        {showIcon ? (
          <span aria-hidden="true" className="PdxMessageIcon">
            {icon ?? <MessageIcon size={16} />}
          </span>
        ) : null}
        <span className="PdxMessageText">{text}</span>
        {closable ? (
          <button
            aria-label={closeLabel}
            className="PdxMessageClose"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={14} />
          </button>
        ) : null}
      </div>
    );
  }
);

export default PdxMessage;
