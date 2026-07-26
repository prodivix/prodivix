import './PdxNotification.scss';
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

export interface PdxNotificationOwnProps {
  actions?: ReactNode;
  closable?: boolean;
  closeLabel?: string;
  description?: ReactNode;
  icon?: ReactNode;
  onClose?: () => void;
  showIcon?: boolean;
  title: ReactNode;
  type?: PdxFeedbackType;
  /** Spoken type name. `null` drops it when the title already says so. */
  typeLabel?: string | null;
}

export type PdxNotificationProps = Omit<
  PdxNativeProps<'div'>,
  'children' | 'title'
> &
  PdxNotificationOwnProps;

/**
 * A notification arrives unrequested, so it announces itself through a live
 * region and leaves focus alone. Its actions stay reachable by Tab in the
 * order the notification was rendered.
 */
const PdxNotification = forwardRef<HTMLDivElement, PdxNotificationProps>(
  function PdxNotification(
    {
      actions,
      'aria-atomic': ariaAtomic,
      'aria-live': ariaLive,
      className,
      closable = false,
      closeLabel = 'Dismiss notification',
      dataAttributes,
      description,
      icon,
      onClose,
      role,
      showIcon = true,
      title,
      type = 'Info',
      typeLabel,
      ...rest
    },
    ref
  ) {
    const NotificationIcon = PDX_FEEDBACK_ICONS[type];
    const resolvedRole = role ?? resolveFeedbackRole(type);
    const spokenType =
      typeLabel === undefined ? PDX_FEEDBACK_TYPE_LABELS[type] : typeLabel;

    return (
      <div
        {...rest}
        {...getDataAttributes(dataAttributes)}
        aria-atomic={ariaAtomic ?? true}
        aria-live={ariaLive ?? resolveFeedbackLiveness(resolvedRole)}
        className={mergeClassNames('PdxNotification', type, className)}
        ref={ref}
        role={resolvedRole}
      >
        {spokenType ? (
          <span className="PdxNotificationType">{spokenType}</span>
        ) : null}
        {showIcon ? (
          <span aria-hidden="true" className="PdxNotificationIcon">
            {icon ?? <NotificationIcon size={18} />}
          </span>
        ) : null}
        <div className="PdxNotificationBody">
          <div className="PdxNotificationTitle">{title}</div>
          {description ? (
            <div className="PdxNotificationDescription">{description}</div>
          ) : null}
          {actions ? (
            <div className="PdxNotificationActions">{actions}</div>
          ) : null}
        </div>
        {closable ? (
          <button
            aria-label={closeLabel}
            className="PdxNotificationClose"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={15} />
          </button>
        ) : null}
      </div>
    );
  }
);

export default PdxNotification;
