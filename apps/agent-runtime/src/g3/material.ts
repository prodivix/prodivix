import {
  BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
  BEHAVIOR_DETERMINISTIC_CONTROL_PRESET_ID,
  digestBehaviorControlProfile,
  digestBehaviorFixtureSet,
  isBehaviorControlProfile,
  isBehaviorFixtureSet,
  type BehaviorControlProfile,
  type BehaviorFixtureSet,
} from '@prodivix/behavior';
import {
  decodeAuthoredBrowserVerificationCellProfile,
  type AuthoredBrowserVerificationCellProfile,
} from '@prodivix/verification-browser';
import {
  isWorkspaceProjectConfigDocumentContent,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { isPlainObject } from '@prodivix/shared/safety';
import {
  digestVerificationValue,
  isVerificationBaselineSet,
  type VerificationPlanCell,
  type VerificationBaselineSet,
} from '@prodivix/verification';

export const readDriverControls = (
  workspace: WorkspaceSnapshot,
  cell: VerificationPlanCell
): Readonly<{
  profile: BehaviorControlProfile;
  fixtures: readonly BehaviorFixtureSet[];
}> => {
  const reference = cell.controlProfileRef;
  const profile =
    reference.kind === 'preset' &&
    reference.presetId === BEHAVIOR_DETERMINISTIC_CONTROL_PRESET_ID
      ? BEHAVIOR_DETERMINISTIC_CONTROL_PRESET
      : reference.kind === 'workspace'
        ? workspace.docsById[reference.documentId]?.content
        : undefined;
  if (
    !isBehaviorControlProfile(profile) ||
    digestBehaviorControlProfile(profile) !== reference.digest ||
    profile.network.mode !== 'fixture-only'
  )
    throw new Error(
      'G3 control profile is missing, changed, or allows live data.'
    );
  const fixture = cell.fixtureSetRef
    ? workspace.docsById[cell.fixtureSetRef.documentId]?.content
    : undefined;
  if (
    cell.fixtureSetRef &&
    (!isBehaviorFixtureSet(fixture) ||
      digestBehaviorFixtureSet(fixture) !== cell.fixtureSetRef.digest)
  )
    throw new Error('G3 canonical fixture set is missing or changed.');
  return { profile, fixtures: isBehaviorFixtureSet(fixture) ? [fixture] : [] };
};

/** Concrete Browser policy stays in the exact confirmed Config partition. */
export const readDriverBrowserProfile = (
  workspace: WorkspaceSnapshot,
  cell: VerificationPlanCell
): AuthoredBrowserVerificationCellProfile | undefined => {
  const matches: unknown[] = [];
  for (const document of Object.values(workspace.docsById)) {
    if (
      document.type !== 'project-config' ||
      !isWorkspaceProjectConfigDocumentContent(document.content) ||
      !isPlainObject(document.content.value)
    )
      continue;
    const verification = document.content.value.verification;
    if (
      !isPlainObject(verification) ||
      !Array.isArray(verification.browserProfiles)
    )
      continue;
    for (const entry of verification.browserProfiles)
      if (
        isPlainObject(entry) &&
        entry.checkId === cell.checkId &&
        entry.scenarioId === cell.scenarioId
      ) {
        if (
          Object.keys(entry).some(
            (key) => !['checkId', 'scenarioId', 'profile'].includes(key)
          )
        )
          throw new Error('G3 authored Browser profile has unknown fields.');
        matches.push(entry.profile);
      }
  }
  if (matches.length === 0 && cell.checkKind === 'e2e') return undefined;
  if (matches.length !== 1)
    throw new Error('G3 authored Browser profile must resolve exactly once.');
  const profile = decodeAuthoredBrowserVerificationCellProfile(matches[0]);
  if (profile.kind !== cell.checkKind)
    throw new Error('G3 authored Browser check kind drifted.');
  return profile;
};

export const readDriverBaseline = (
  workspace: WorkspaceSnapshot,
  cell: VerificationPlanCell
): VerificationBaselineSet | undefined => {
  if (!cell.baselineSetRef) return undefined;
  const content = workspace.docsById[cell.baselineSetRef.documentId]?.content;
  if (
    !isVerificationBaselineSet(content) ||
    digestVerificationValue(content) !== cell.baselineSetRef.digest
  )
    throw new Error('G3 canonical baseline is missing or changed.');
  return content;
};
