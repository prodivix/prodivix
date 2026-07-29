import type { BehaviorScenarioProgram } from '@prodivix/behavior';
import type { DeterministicRuntimeSession } from '@prodivix/runtime-core';
import type {
  VerificationArtifactConsoleEvent,
  VerificationArtifactNetworkOperation,
} from '@prodivix/verification';
import type { Browser, Page } from 'playwright-core';
import type { KeyboardFocusJourneySpec } from '../accessibility';
import type {
  BrowserVerificationRuntimeIdentity,
  BrowserVisualCellProfile,
} from '../browserAdapter.types';
import type { BrowserRuntimeControlAttestation } from '../browserRuntimeControlPort';
import type {
  BrowserToolPoolAcquireInput,
  BrowserToolSession,
  BrowserToolVisualCapture,
} from '../browserVerificationPort';
import type { PerformancePolicyProfile } from '../performance';
import type { BrowserSecurityPolicyProfile } from '../security';
import {
  executePlaywrightKeyboardFocusJourney,
  scanPlaywrightAccessibility,
} from './playwrightAccessibilityCollector';
import { executePlaywrightBehavior } from './playwrightBehaviorCollector';
import { assertObservedRuntime, assertOrigin } from './playwrightBrowserShared';
import { PlaywrightDeterministicControlHost } from './playwrightDeterministicControlHost';
import { collectPlaywrightPerformance } from './playwrightPerformanceCollector';
import {
  createPlaywrightPerformanceProbeBinding,
  type PlaywrightPerformanceProbeBinding,
} from './playwrightPerformanceProbe';
import { observePlaywrightPreAuthorRuntime } from './playwrightRuntimeObservation';
import {
  observePlaywrightProviderSandbox,
  PlaywrightSecurityTelemetry,
} from './playwrightSecurityTelemetry';
import {
  createTrustedPageProbeBinding,
  type TrustedPageProbeBinding,
} from './playwrightTrustedPageProbe';
import { capturePlaywrightVisual } from './playwrightVisualCollector';

export class PlaywrightBrowserTool implements BrowserToolSession {
  readonly #page: Page;
  readonly #origin: string;
  readonly #cell: BrowserToolPoolAcquireInput['cell'];
  readonly #telemetry: PlaywrightSecurityTelemetry;
  readonly #performanceProbe: PlaywrightPerformanceProbeBinding;
  readonly #trustedPageProbe: TrustedPageProbeBinding;
  readonly #runtimeControlSession: DeterministicRuntimeSession;
  readonly #controlHost: PlaywrightDeterministicControlHost;
  readonly #input: BrowserToolPoolAcquireInput;
  readonly runtimeControlAttestation: BrowserRuntimeControlAttestation;
  #terminalRuntimeControlAttestation:
    BrowserRuntimeControlAttestation | undefined;
  #runtimeIdentity: BrowserVerificationRuntimeIdentity;
  #closePromise: Promise<void> | undefined;

  private constructor(
    page: Page,
    origin: string,
    input: BrowserToolPoolAcquireInput,
    telemetry: PlaywrightSecurityTelemetry,
    performanceProbe: PlaywrightPerformanceProbeBinding,
    trustedPageProbe: TrustedPageProbeBinding,
    runtimeControlSession: DeterministicRuntimeSession,
    controlHost: PlaywrightDeterministicControlHost,
    runtimeControlAttestation: BrowserRuntimeControlAttestation
  ) {
    this.#page = page;
    this.#origin = origin;
    this.#cell = input.cell;
    this.#runtimeIdentity = input.runtimeIdentity;
    this.#telemetry = telemetry;
    this.#performanceProbe = performanceProbe;
    this.#trustedPageProbe = trustedPageProbe;
    this.#runtimeControlSession = runtimeControlSession;
    this.#controlHost = controlHost;
    this.#input = input;
    this.runtimeControlAttestation = runtimeControlAttestation;
  }

  get observedRuntimeIdentity(): BrowserVerificationRuntimeIdentity {
    return this.#runtimeIdentity;
  }

  static async create(
    browser: Browser,
    input: BrowserToolPoolAcquireInput
  ): Promise<PlaywrightBrowserTool> {
    const origin = assertOrigin(input.origin);
    const controlHost = new PlaywrightDeterministicControlHost(browser, input);
    const started = await input.runtimeControlLease.start(controlHost);
    if (started.status !== 'ready') {
      throw new Error(
        `Browser deterministic controls were blocked: ${started.code}.`
      );
    }
    try {
      const page = controlHost.page;
      const preAuthorObservation =
        await observePlaywrightPreAuthorRuntime(page);
      const performanceProbe = createPlaywrightPerformanceProbeBinding();
      const trustedPageProbe = createTrustedPageProbeBinding();
      await controlHost.installRuntimeControls(started.session, {
        performanceProbe,
        trustedPageProbe,
      });
      const sandboxObservation = await observePlaywrightProviderSandbox(page);
      const telemetry = new PlaywrightSecurityTelemetry(
        page,
        sandboxObservation
      );
      await controlHost.runControlledOperation(
        started.session,
        'initial-navigation',
        () => controlHost.navigateToTarget()
      );
      const runtimeControlAttestation = input.runtimeControlLease.assertIssued(
        await input.runtimeControlLease.attest('initial')
      );
      const tool = new PlaywrightBrowserTool(
        page,
        origin,
        input,
        telemetry,
        performanceProbe,
        trustedPageProbe,
        started.session,
        controlHost,
        runtimeControlAttestation
      );
      tool.#runtimeIdentity = assertObservedRuntime(
        input,
        browser.version(),
        preAuthorObservation
      );
      return tool;
    } catch (error) {
      await started.session.cleanup();
      throw error;
    }
  }

  close(): Promise<void> {
    this.#closePromise ??= this.#cleanup();
    return this.#closePromise;
  }

  async #cleanup(): Promise<void> {
    const cleanup = await this.#runtimeControlSession.cleanup();
    if (!cleanup.clean) {
      throw new Error(
        'Playwright deterministic control cleanup left residual state.'
      );
    }
  }

  executeBehavior(program: BehaviorScenarioProgram): Promise<unknown> {
    return this.#controlHost.runControlledOperation(
      this.#runtimeControlSession,
      'behavior',
      () =>
        executePlaywrightBehavior({
          page: this.#page,
          origin: this.#origin,
          cell: this.#cell,
          program,
          trustedPageProbe: this.#trustedPageProbe,
        })
    );
  }

  scanAccessibility(
    scanTargetId: string,
    targetManifest: BehaviorScenarioProgram['targetManifest']
  ): Promise<unknown> {
    return this.#controlHost.runControlledOperation(
      this.#runtimeControlSession,
      'accessibility-scan',
      () =>
        scanPlaywrightAccessibility({
          page: this.#page,
          cell: this.#cell,
          scanTargetId,
          targetManifest,
          trustedPageProbe: this.#trustedPageProbe,
        })
    );
  }

  executeKeyboardFocusJourney(
    spec: KeyboardFocusJourneySpec,
    targetManifest: BehaviorScenarioProgram['targetManifest'],
    settleMs: number
  ): Promise<unknown> {
    return this.#controlHost.runControlledOperation(
      this.#runtimeControlSession,
      'keyboard-focus',
      () =>
        executePlaywrightKeyboardFocusJourney(
          this.#page,
          spec,
          targetManifest,
          this.#trustedPageProbe,
          settleMs
        )
    );
  }

  captureVisual(
    profile: BrowserVisualCellProfile,
    targetManifest: BehaviorScenarioProgram['targetManifest']
  ): Promise<BrowserToolVisualCapture> {
    return this.#controlHost.runControlledOperation(
      this.#runtimeControlSession,
      'visual-capture',
      () =>
        capturePlaywrightVisual({
          page: this.#page,
          cell: this.#cell,
          profile,
          targetManifest,
          runtimeIdentity: this.#runtimeIdentity,
          trustedPageProbe: this.#trustedPageProbe,
        })
    );
  }

  collectPerformance(
    policy: PerformancePolicyProfile,
    profileDigest: string,
    program: BehaviorScenarioProgram
  ): Promise<unknown> {
    return this.#controlHost.runControlledOperation(
      this.#runtimeControlSession,
      'performance',
      () =>
        collectPlaywrightPerformance({
          page: this.#page,
          runtimeIdentity: this.#runtimeIdentity,
          policy,
          profileDigest,
          program,
          executeBehavior: (scenarioProgram, hooks) =>
            executePlaywrightBehavior({
              page: this.#page,
              origin: this.#origin,
              cell: this.#cell,
              program: scenarioProgram,
              trustedPageProbe: this.#trustedPageProbe,
              hooks,
            }),
          probeBinding: this.#performanceProbe,
        })
    );
  }

  collectSecurity(profile: BrowserSecurityPolicyProfile): Promise<unknown> {
    return this.#controlHost.runControlledOperation(
      this.#runtimeControlSession,
      'security',
      () => this.#telemetry.collectSecurity(profile)
    );
  }

  collectNetworkSummary(): Promise<
    readonly VerificationArtifactNetworkOperation[]
  > {
    return this.#controlHost.runControlledOperation(
      this.#runtimeControlSession,
      'network-summary',
      () => this.#telemetry.collectNetworkSummary()
    );
  }

  async collectConsoleSummary(): Promise<
    readonly VerificationArtifactConsoleEvent[]
  > {
    return this.#controlHost.runControlledOperation(
      this.#runtimeControlSession,
      'console-summary',
      () => this.#telemetry.collectConsoleSummary()
    );
  }

  async finalizeRuntimeControls(): Promise<BrowserRuntimeControlAttestation> {
    if (this.#terminalRuntimeControlAttestation) {
      return this.#terminalRuntimeControlAttestation;
    }
    const attestation = this.#input.runtimeControlLease.assertIssued(
      await this.#input.runtimeControlLease.attest('terminal')
    );
    if (attestation.phase !== 'terminal') {
      throw new Error(
        'Browser runtime control finalization returned a non-terminal attestation.'
      );
    }
    this.#terminalRuntimeControlAttestation = attestation;
    return attestation;
  }
}
