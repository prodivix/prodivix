import type { AnimationMotionMode } from './animation.types';

export type AnimationSystemMotionPreference = 'full' | 'reduced';
export type AnimationProjectMotionPolicy =
  'follow-system' | AnimationMotionMode;
export type AnimationVerificationMotionOverride =
  'inherit' | AnimationMotionMode;

export type ResolvedAnimationMotionPolicy = Readonly<{
  mode: AnimationMotionMode;
  source: 'system' | 'project' | 'verification';
}>;

/**
 * Resolves motion once at the runtime composition boundary. Domain executors
 * receive only the resolved mode, so Browser/Export/CI cannot reinterpret the
 * same project policy differently.
 */
export const resolveAnimationMotionPolicy = (
  input: Readonly<{
    system: AnimationSystemMotionPreference;
    project?: AnimationProjectMotionPolicy;
    verification?: AnimationVerificationMotionOverride;
  }>
): ResolvedAnimationMotionPolicy => {
  if (input.verification === 'full' || input.verification === 'reduced') {
    return Object.freeze({
      mode: input.verification,
      source: 'verification',
    });
  }
  if (input.project === 'full' || input.project === 'reduced') {
    return Object.freeze({ mode: input.project, source: 'project' });
  }
  return Object.freeze({ mode: input.system, source: 'system' });
};
