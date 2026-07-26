import {
  AlertTriangle,
  CheckCircle2,
  CircleX,
  Info,
  type LucideIcon,
} from 'lucide-react';

export type PdxFeedbackType = 'Info' | 'Success' | 'Warning' | 'Danger';

/**
 * Message and notification are the same statement at two densities, so the
 * icon, the announced role and the spoken type name are decided here once
 * instead of drifting between the two surfaces.
 */
export const PDX_FEEDBACK_ICONS: Record<PdxFeedbackType, LucideIcon> = {
  Info,
  Success: CheckCircle2,
  Warning: AlertTriangle,
  Danger: CircleX,
};

/**
 * Colour and icon shape are the only visual carriers of the feedback type and
 * neither reaches a screen reader, so each surface also states its type as
 * text. `Danger` is spoken as "Error" because that is what the reader is being
 * told, not how the surface is styled.
 */
export const PDX_FEEDBACK_TYPE_LABELS: Record<PdxFeedbackType, string> = {
  Info: 'Information',
  Success: 'Success',
  Warning: 'Warning',
  Danger: 'Error',
};

/**
 * Problems interrupt whatever the reader is doing; confirmations wait for a
 * gap. Both are live regions — neither ever takes focus.
 */
export function resolveFeedbackRole(type: PdxFeedbackType): 'alert' | 'status' {
  return type === 'Danger' || type === 'Warning' ? 'alert' : 'status';
}

/** The politeness a live-region role implies, stated so it is not inferred. */
export function resolveFeedbackLiveness(
  role: string
): 'assertive' | 'polite' | undefined {
  if (role === 'alert') return 'assertive';
  if (role === 'status') return 'polite';
  return undefined;
}
