import {
  createExecutionSecretLeakGuard,
  inspectExecutionArtifactContents,
  EXECUTION_BUILD_BUNDLE_MEDIA_TYPE,
} from '@prodivix/runtime-core';
import { scanProductionBundleForVerificationProbe } from '@prodivix/prodivix-compiler';
import { digestVerificationValue } from '@prodivix/verification';
import {
  BROWSER_SECURITY_CORE_OBSERVATION_SOURCES,
  BROWSER_SECURITY_OBSERVATION_SET_FORMAT,
  BROWSER_SECURITY_OBSERVATION_SET_VERSION,
  decodeBrowserSecurityObservationSet,
  type BrowserSecurityObservationSet,
  type BrowserSecurityObservationSetBinding,
} from '@prodivix/verification-browser';
import type { ControlledStaticToolchainResult } from '@prodivix/verification-adapters';

export const driverSecurityExpectedDigest = (ruleId: string): string =>
  digestVerificationValue({
    contract: 'prodivix.agent-runtime-security-inspection',
    ruleId,
    verdict: 'clean',
  });
/** These three facts come from actual G2 byte inspection and compiler scanning. */
export const inspectDriverSecurity = (input: {
  toolchain: ControlledStaticToolchainResult;
  binding: BrowserSecurityObservationSetBinding;
  targetId: string;
  sourceTraceDigest: string;
  canaries: readonly string[];
}): BrowserSecurityObservationSet => {
  const guard = createExecutionSecretLeakGuard({
    secretValues: input.canaries,
  });
  const bundleBytes = Buffer.from(
    input.toolchain.projectionAuthority.raw.buildBundle.contents,
    'base64'
  );
  const directSafe = input.toolchain.buildBundle.files.every(
    ({ contents }) => guard.inspectBytes('artifact-content', contents).safe
  );
  const envelope = inspectExecutionArtifactContents(
    guard,
    'artifact-content',
    EXECUTION_BUILD_BUNDLE_MEDIA_TYPE,
    bundleBytes
  );
  const probes = scanProductionBundleForVerificationProbe(
    input.toolchain.buildBundle.files
  );
  const observations = (
    Object.keys(
      BROWSER_SECURITY_CORE_OBSERVATION_SOURCES
    ) as (keyof typeof BROWSER_SECURITY_CORE_OBSERVATION_SOURCES)[]
  ).map((ruleId) => {
    const safe =
      ruleId === 'security.secret-canary'
        ? directSafe
        : ruleId === 'security.production-probe-leak'
          ? probes.status === 'clean'
          : envelope.safe;
    const sourceDigest = digestVerificationValue({
      ruleId,
      bundleDigest: input.toolchain.buildBundle.snapshotDigest,
      inspectedFiles: input.toolchain.buildBundle.files.map(
        ({ path, digest, size }) => ({ path, digest, size })
      ),
      safe,
    });
    return {
      source: {
        ...BROWSER_SECURITY_CORE_OBSERVATION_SOURCES[ruleId],
        sourceDigest,
      },
      observation: {
        ruleId,
        state: 'complete' as const,
        targetId: input.targetId,
        expectedDigest: driverSecurityExpectedDigest(ruleId),
        observedDigest: safe
          ? driverSecurityExpectedDigest(ruleId)
          : digestVerificationValue({ ruleId, verdict: 'blocked' }),
        violationCount: safe ? 0 : 1,
        diagnosticCodes: safe ? [] : ['VER-ORDINARY-G3-SECURITY'],
        sourceTraceDigest: input.sourceTraceDigest,
      },
    };
  });
  return decodeBrowserSecurityObservationSet({
    format: BROWSER_SECURITY_OBSERVATION_SET_FORMAT,
    version: BROWSER_SECURITY_OBSERVATION_SET_VERSION,
    complete: true,
    binding: input.binding,
    observations,
  });
};
