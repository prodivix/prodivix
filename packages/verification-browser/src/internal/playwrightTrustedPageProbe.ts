export {
  armTrustedDynamicAnnouncement,
  armTrustedKeyboardActivation,
  cleanupTrustedDynamicAnnouncement,
  cleanupTrustedKeyboardActivation,
  observeTrustedDynamicAnnouncement,
  observeTrustedKeyboard,
  resetTrustedKeyboardFocus,
  resolveTrustedSemanticTargetIndex,
  scanTrustedAxe,
} from './playwrightTrustedPageProbeClient';
export {
  createTrustedAxeInitSource,
  createTrustedPageProbeBinding,
  initTrustedPageProbe,
  installPlaywrightTrustedPageProbe,
  type TrustedAxeResult,
  type TrustedDynamicAnnouncementObservation,
  type TrustedKeyboardObservation,
  type TrustedPageProbeBinding,
  type TrustedSemanticTargetIdentity,
} from './playwrightTrustedPageProbeRuntime';
