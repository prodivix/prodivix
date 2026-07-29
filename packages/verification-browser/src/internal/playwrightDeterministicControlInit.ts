import type { BrowserContext } from 'playwright-core';
import {
  installPlaywrightDeterministicAuthorSandbox,
  type PlaywrightAuthorSandboxActivity,
} from './playwrightDeterministicAuthorSandboxInit';
import type {
  BrowserRuntimeControlExpectedWitness,
  BrowserRuntimeControlIdentifierNamespace,
} from '../browserRuntimeControlPort';
import type {
  RuntimeCursorProjection,
  RuntimeCursorSealManifest,
  RuntimeReportEvent,
} from './playwrightDeterministicControlProtocol';
import {
  createPlaywrightPerformanceProbeInitInput,
  initTrustedPerformanceProbe,
  type PlaywrightPerformanceProbeBinding,
} from './playwrightPerformanceProbe';
import {
  createTrustedAxeInitSource,
  initTrustedPageProbe,
  type TrustedPageProbeBinding,
} from './playwrightTrustedPageProbe';

export type PlaywrightRuntimeControlInitInput = Readonly<{
  randomValues: readonly number[];
  identifierValues: Readonly<
    Record<BrowserRuntimeControlIdentifierNamespace, readonly string[]>
  >;
  operationUuids: readonly string[];
  expectedWitness: BrowserRuntimeControlExpectedWitness;
  namespace: string;
  fixtureBindingDigest: string;
  executableSnapshotDigest: string;
  allowedUrls: readonly string[];
  reportBindingKey: string;
  probeKey: string;
  probeCapability: string;
  performanceProbeKey: string;
  trustedPageProbeKey: string;
  cursorSeals: RuntimeCursorSealManifest;
}>;

type RuntimeWitness = Readonly<{
  expectedRandomSample: number;
  observedRandomSample: number;
  expectedIdentifierSamples: BrowserRuntimeControlExpectedWitness['identifierSamples'];
  observedIdentifierSamples: BrowserRuntimeControlExpectedWitness['identifierSamples'];
  expectedOperationUuid: string;
  observedOperationUuid: string;
}>;

export type PlaywrightRuntimeSnapshot = RuntimeWitness &
  Readonly<{
    cursor: RuntimeCursorProjection;
    now: number;
    namespace: string | null;
    fixtureBindingDigest: string | null;
    executableSnapshotDigest: string | null;
    pendingTimers: number;
    pendingStreams: number;
    activeWorkers: number;
    authoredAnimationCreationCount: number;
    authorAnimationFrameCreationCount: number;
    cryptoRandomCreationCount: number;
    nativeTimerCreationCount: number;
    streamCreationCount: number;
    workerCreationCount: number;
    deniedWorkerCreations: number;
    deniedRequests: number;
    authorRequestCreationCount: number;
    virtualAnimationTimeMs: number;
    animationClockSyncCount: number;
    storage: Readonly<{
      localStorageEntries: number;
      sessionStorageEntries: number;
      sessionStorageKeys: readonly string[];
      indexedDbDatabases: number;
      cacheStorageEntries: number;
      serviceWorkerRegistrations: number;
    }>;
    rendering: Readonly<{
      width: number;
      height: number;
      devicePixelRatio: number;
      colorScheme: 'dark' | 'light';
      motion: 'full' | 'reduced';
      locale: string;
      timezone: string;
      fontReady: boolean;
      activeAnimations: number;
      origin: string;
    }>;
  }>;

export type PlaywrightRuntimeSettleResult = Readonly<{
  snapshot: PlaywrightRuntimeSnapshot;
  observedFrames: number;
  timeOrigin: number;
  performanceNowDelta: number;
  animationFrameTimestamp: number;
}>;

export type PlaywrightRuntimeProbeResponse =
  | Readonly<{ status: 'synced'; virtualAnimationTimeMs: number }>
  | PlaywrightRuntimeSnapshot
  | PlaywrightRuntimeSettleResult;

export const installRuntimeControlInit = (
  input: PlaywrightRuntimeControlInitInput,
  installAuthorSandbox: typeof installPlaywrightDeterministicAuthorSandbox
): void => {
  const root = globalThis as typeof globalThis & Record<string, unknown>;
  const nativeApply = Reflect.apply;
  const nativeDefineProperty = Object.defineProperty;
  const nativeFreeze = Object.freeze;
  const nativeKeys = Object.keys;
  const nativeJsonParse = JSON.parse;
  const nativeJsonStringify = JSON.stringify;
  const nativeIsArray = Array.isArray;
  const nativeIsSafeInteger = Number.isSafeInteger;
  const nativePromise = Promise;
  const nativeStorageGetItem = Storage.prototype.getItem;
  const nativeStorageSetItem = Storage.prototype.setItem;
  const nativeStorageKey = Storage.prototype.key;
  const nativeStorageLength = Object.getOwnPropertyDescriptor(
    Storage.prototype,
    'length'
  )?.get;
  const nativeGetAnimations = Document.prototype.getAnimations;
  const nativeIndexedDbDatabases =
    typeof indexedDB.databases === 'function'
      ? indexedDB.databases.bind(indexedDB)
      : undefined;
  const nativeCacheKeys =
    typeof caches === 'undefined' ? undefined : caches.keys.bind(caches);
  const nativeServiceWorkerRegistrations =
    'serviceWorker' in navigator
      ? navigator.serviceWorker.getRegistrations.bind(navigator.serviceWorker)
      : undefined;
  const nativeMatchMedia = globalThis.matchMedia.bind(globalThis);
  const nativeDateTimeFormat = Intl.DateTimeFormat;
  const nativeDateNow = Date.now;
  const nativeLocationOrigin = location.origin;
  const capturedViewport = nativeFreeze({
    width: innerWidth,
    height: innerHeight,
    devicePixelRatio,
    locale: navigator.language,
    timezone: new nativeDateTimeFormat().resolvedOptions().timeZone,
  });
  const fontSet = document.fonts;
  const fontReadyPromise = fontSet.ready;
  const nativeFontStatusGetter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(fontSet),
    'status'
  )?.get;
  const reportPromises = new Set<Promise<unknown>>();
  const report = (event: RuntimeReportEvent): void => {
    const binding = root[input.reportBindingKey];
    if (typeof binding !== 'function') {
      throw new Error('Deterministic browser attempt reporter is unavailable.');
    }
    const pending = nativeApply(
      binding as (value: RuntimeReportEvent) => Promise<unknown>,
      root,
      [event]
    ) as Promise<unknown>;
    reportPromises.add(pending);
    void pending.finally(() => reportPromises.delete(pending));
  };
  const reportActivity = (
    activity: Extract<RuntimeReportEvent, { kind: 'activity' }>['activity'],
    policyDirective?: string
  ): void =>
    report({
      kind: 'activity',
      activity,
      ...(policyDirective === undefined ? {} : { policyDirective }),
    });
  const flushReports = async (): Promise<void> => {
    while (reportPromises.size > 0) {
      await nativePromise.all([...reportPromises]);
    }
  };

  if (
    input.cursorSeals.format !== 'prodivix.browser-runtime-cursor-seals' ||
    input.cursorSeals.version !== 1 ||
    typeof root[input.performanceProbeKey] !== 'function' ||
    typeof root[input.trustedPageProbeKey] !== 'function'
  ) {
    throw new Error(
      'Trusted browser probes did not initialize before runtime controls.'
    );
  }

  type ClockController = {
    fastForward(ticks: number): Promise<void>;
    performanceNow(): number;
    countTimers(): number;
  };
  type ClockState = {
    controller: ClockController;
    builtins: {
      requestAnimationFrame?: (callback: (timestamp: number) => void) => number;
      performance?: Performance;
    };
  };
  const clockState = root['__pwClock'] as ClockState | undefined;
  const clockController = clockState?.controller;
  const nativeClockBuiltins = clockState?.builtins;
  if (
    !clockController ||
    typeof clockController.fastForward !== 'function' ||
    typeof clockController.performanceNow !== 'function' ||
    typeof clockController.countTimers !== 'function' ||
    typeof nativeClockBuiltins?.requestAnimationFrame !== 'function' ||
    !nativeClockBuiltins.performance
  ) {
    throw new Error(
      'Playwright virtual Clock was not installed before runtime controls.'
    );
  }
  const controllerFastForward =
    clockController.fastForward.bind(clockController);
  const controllerPerformanceNow =
    clockController.performanceNow.bind(clockController);
  const controllerCountTimers =
    clockController.countTimers.bind(clockController);
  const nativeRequestAnimationFrame = nativeClockBuiltins.requestAnimationFrame;
  const nativePerformance = nativeClockBuiltins.performance;
  const nativePerformanceNow = nativePerformance.now.bind(nativePerformance);
  const nativeTimeOrigin = nativePerformance.timeOrigin;
  const pendingClockControls: Array<
    Readonly<{ method: 'fastForward'; ticks: number }>
  > = [];
  const controlledClockFacade = nativeFreeze({
    async fastForward(ticks: number): Promise<void> {
      if (!nativeIsSafeInteger(ticks) || ticks < 0) {
        reportActivity('clock-control-attempted');
        throw new Error('Virtual Clock fast-forward must be non-negative.');
      }
      pendingClockControls.push(
        nativeFreeze({ method: 'fastForward' as const, ticks })
      );
      await controllerFastForward(ticks);
    },
    log(): never {
      reportActivity('clock-control-attempted');
      throw new Error('Author access to virtual Clock replay is denied.');
    },
    install(): never {
      reportActivity('clock-control-attempted');
      throw new Error('Author virtual Clock installation is denied.');
    },
    pauseAt(): never {
      reportActivity('clock-control-attempted');
      throw new Error('Author virtual Clock pause is denied.');
    },
    resume(): never {
      reportActivity('clock-control-attempted');
      throw new Error('Author virtual Clock resume is denied.');
    },
    runFor(): never {
      reportActivity('clock-control-attempted');
      throw new Error('Author virtual Clock advancement is denied.');
    },
    setFixedTime(): never {
      reportActivity('clock-control-attempted');
      throw new Error('Author virtual Clock mutation is denied.');
    },
    setSystemTime(): never {
      reportActivity('clock-control-attempted');
      throw new Error('Author virtual Clock mutation is denied.');
    },
  });
  nativeDefineProperty(root, '__pwClock', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: nativeFreeze({ controller: controlledClockFacade }),
  });

  type SealedCursor = {
    format: 'prodivix.browser-runtime-cursor';
    version: 1;
    nonce: string;
    cursor: RuntimeCursorProjection;
    witness?: RuntimeWitness;
    seals: {
      documentInitializationCount: string;
      randomSampleCount: string;
      identifierSampleCounts: Record<
        BrowserRuntimeControlIdentifierNamespace,
        string
      >;
      witness: string;
    };
  };
  const cursorStorageKey = '__prodivix_runtime_cursor_seal__';
  const exactKeys = (value: object, expected: readonly string[]): boolean =>
    nativeKeys(value).sort().join('\u0000') ===
    [...expected].sort().join('\u0000');
  const sameWitness = (value: unknown): value is RuntimeWitness =>
    nativeJsonStringify(value) ===
    nativeJsonStringify(input.cursorSeals.expectedWitnessObservation);
  const validateSealedCursor = (value: unknown): SealedCursor => {
    if (
      typeof value !== 'object' ||
      value === null ||
      nativeIsArray(value) ||
      !exactKeys(value, [
        'format',
        'version',
        'nonce',
        'cursor',
        'seals',
        ...('witness' in value ? ['witness'] : []),
      ])
    ) {
      throw new Error('Deterministic browser runtime cursor was tampered.');
    }
    const sealed = value as SealedCursor;
    const cursor = sealed.cursor;
    const identifierCounts = cursor?.identifierSampleCounts;
    const seals = sealed.seals;
    if (
      sealed.format !== 'prodivix.browser-runtime-cursor' ||
      sealed.version !== 1 ||
      sealed.nonce !== input.cursorSeals.nonce ||
      typeof cursor !== 'object' ||
      cursor === null ||
      !exactKeys(cursor, [
        'documentInitializationCount',
        'randomSampleCount',
        'identifierSampleCounts',
        'witnessCaptured',
      ]) ||
      !nativeIsSafeInteger(cursor.documentInitializationCount) ||
      cursor.documentInitializationCount < 0 ||
      !nativeIsSafeInteger(cursor.randomSampleCount) ||
      cursor.randomSampleCount < 0 ||
      typeof cursor.witnessCaptured !== 'boolean' ||
      typeof identifierCounts !== 'object' ||
      identifierCounts === null ||
      !exactKeys(identifierCounts, [
        'attempt',
        'step',
        'action',
        'operation',
      ]) ||
      Object.values(identifierCounts).some(
        (sample) => !nativeIsSafeInteger(sample) || sample < 0
      ) ||
      typeof seals !== 'object' ||
      seals === null ||
      !exactKeys(seals, [
        'documentInitializationCount',
        'randomSampleCount',
        'identifierSampleCounts',
        'witness',
      ]) ||
      typeof seals.identifierSampleCounts !== 'object' ||
      seals.identifierSampleCounts === null ||
      !exactKeys(seals.identifierSampleCounts, [
        'attempt',
        'step',
        'action',
        'operation',
      ]) ||
      seals.documentInitializationCount !==
        input.cursorSeals.documentCountSeals[
          cursor.documentInitializationCount
        ] ||
      seals.randomSampleCount !==
        input.cursorSeals.randomSampleCountSeals[cursor.randomSampleCount] ||
      (['attempt', 'step', 'action', 'operation'] as const).some(
        (identifierNamespace) =>
          seals.identifierSampleCounts[identifierNamespace] !==
          input.cursorSeals.identifierSampleCountSeals[identifierNamespace][
            identifierCounts[identifierNamespace]
          ]
      ) ||
      (cursor.witnessCaptured
        ? !sameWitness(sealed.witness) ||
          seals.witness !== input.cursorSeals.witnessStateSeals.captured
        : sealed.witness !== undefined ||
          seals.witness !== input.cursorSeals.witnessStateSeals.pending)
    ) {
      throw new Error('Deterministic browser runtime cursor was tampered.');
    }
    return sealed;
  };
  const createInitialCursor = (): SealedCursor => ({
    format: 'prodivix.browser-runtime-cursor',
    version: 1,
    nonce: input.cursorSeals.nonce,
    cursor: {
      documentInitializationCount: 0,
      randomSampleCount: 0,
      identifierSampleCounts: {
        attempt: 0,
        step: 0,
        action: 0,
        operation: 0,
      },
      witnessCaptured: false,
    },
    seals: {
      documentInitializationCount: input.cursorSeals.documentCountSeals[0]!,
      randomSampleCount: input.cursorSeals.randomSampleCountSeals[0]!,
      identifierSampleCounts: {
        attempt: input.cursorSeals.identifierSampleCountSeals.attempt[0]!,
        step: input.cursorSeals.identifierSampleCountSeals.step[0]!,
        action: input.cursorSeals.identifierSampleCountSeals.action[0]!,
        operation: input.cursorSeals.identifierSampleCountSeals.operation[0]!,
      },
      witness: input.cursorSeals.witnessStateSeals.pending,
    },
  });
  const rawCursor = nativeApply(nativeStorageGetItem, sessionStorage, [
    cursorStorageKey,
  ]) as string | null;
  const sealedCursor =
    rawCursor === null
      ? createInitialCursor()
      : validateSealedCursor(nativeJsonParse(rawCursor));
  const cursor = sealedCursor.cursor as {
    documentInitializationCount: number;
    randomSampleCount: number;
    identifierSampleCounts: Record<
      BrowserRuntimeControlIdentifierNamespace,
      number
    >;
    witnessCaptured: boolean;
  };
  let witnessObservation = sealedCursor.witness;
  const persistCursor = (): void => {
    const sealed: SealedCursor = {
      format: 'prodivix.browser-runtime-cursor',
      version: 1,
      nonce: input.cursorSeals.nonce,
      cursor: {
        documentInitializationCount: cursor.documentInitializationCount,
        randomSampleCount: cursor.randomSampleCount,
        identifierSampleCounts: {
          attempt: cursor.identifierSampleCounts.attempt,
          step: cursor.identifierSampleCounts.step,
          action: cursor.identifierSampleCounts.action,
          operation: cursor.identifierSampleCounts.operation,
        },
        witnessCaptured: cursor.witnessCaptured,
      },
      ...(witnessObservation === undefined
        ? {}
        : { witness: witnessObservation }),
      seals: {
        documentInitializationCount:
          input.cursorSeals.documentCountSeals[
            cursor.documentInitializationCount
          ]!,
        randomSampleCount:
          input.cursorSeals.randomSampleCountSeals[cursor.randomSampleCount]!,
        identifierSampleCounts: {
          attempt:
            input.cursorSeals.identifierSampleCountSeals.attempt[
              cursor.identifierSampleCounts.attempt
            ]!,
          step: input.cursorSeals.identifierSampleCountSeals.step[
            cursor.identifierSampleCounts.step
          ]!,
          action:
            input.cursorSeals.identifierSampleCountSeals.action[
              cursor.identifierSampleCounts.action
            ]!,
          operation:
            input.cursorSeals.identifierSampleCountSeals.operation[
              cursor.identifierSampleCounts.operation
            ]!,
        },
        witness:
          witnessObservation === undefined
            ? input.cursorSeals.witnessStateSeals.pending
            : input.cursorSeals.witnessStateSeals.captured,
      },
    };
    validateSealedCursor(sealed);
    nativeApply(nativeStorageSetItem, sessionStorage, [
      cursorStorageKey,
      nativeJsonStringify(sealed),
    ]);
  };
  const reportCursor = (
    transition: Extract<
      RuntimeReportEvent,
      { kind: 'cursor-transition' }
    >['transition'],
    identifierNamespace?: BrowserRuntimeControlIdentifierNamespace
  ): void =>
    report({
      kind: 'cursor-transition',
      transition,
      ...(identifierNamespace === undefined
        ? {}
        : { namespace: identifierNamespace }),
      cursor: {
        documentInitializationCount: cursor.documentInitializationCount,
        randomSampleCount: cursor.randomSampleCount,
        identifierSampleCounts: {
          ...cursor.identifierSampleCounts,
        },
        witnessCaptured: cursor.witnessCaptured,
      },
    });
  cursor.documentInitializationCount += 1;
  persistCursor();
  reportCursor('document-initialized');

  const authorActivity: PlaywrightAuthorSandboxActivity = {
    activeStreams: 0,
    activeWorkers: 0,
    authoredAnimationCreationCount: 0,
    authorAnimationFrameCreationCount: 0,
    cryptoRandomCreationCount: 0,
    nativeTimerCreationCount: 0,
    streamCreationCount: 0,
    workerCreationCount: 0,
    deniedWorkerCreations: 0,
    deniedRequests: 0,
    authorRequestCreationCount: 0,
  };
  let animationClockSyncCount = 0;
  let animationClockOrigin = controllerPerformanceNow();
  let animationClockInitialized = false;
  let virtualAnimationTimeMs = 0;

  const nextIdentifier = (
    identifierNamespace: BrowserRuntimeControlIdentifierNamespace
  ): string => {
    const index = cursor.identifierSampleCounts[identifierNamespace];
    const value = input.identifierValues[identifierNamespace][index];
    if (value === undefined) {
      throw new Error(
        `Deterministic browser identifier budget exceeded: ${identifierNamespace}.`
      );
    }
    cursor.identifierSampleCounts[identifierNamespace] = index + 1;
    persistCursor();
    reportCursor('identifier-consumed', identifierNamespace);
    return value;
  };
  const controlledRandom = (): number => {
    const index = cursor.randomSampleCount;
    const value = input.randomValues[index];
    if (value === undefined) {
      throw new Error('Deterministic browser random sample budget exceeded.');
    }
    cursor.randomSampleCount = index + 1;
    persistCursor();
    reportCursor('random-consumed');
    return value;
  };
  const controlledOperationUuid = (): string => {
    const index = cursor.identifierSampleCounts.operation;
    const value = input.operationUuids[index];
    if (value === undefined) {
      throw new Error('Deterministic browser operation UUID budget exceeded.');
    }
    cursor.identifierSampleCounts.operation = index + 1;
    persistCursor();
    reportCursor('identifier-consumed', 'operation');
    return value;
  };
  nativeDefineProperty(Math, 'random', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: controlledRandom,
  });
  const denyCryptoRandomValues = (): never => {
    authorActivity.cryptoRandomCreationCount += 1;
    reportActivity('crypto-random-created');
    throw new Error(
      'Direct crypto randomness is outside the deterministic identifier owner.'
    );
  };
  nativeDefineProperty(crypto, 'randomUUID', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: controlledOperationUuid,
  });
  nativeDefineProperty(crypto, 'getRandomValues', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: denyCryptoRandomValues,
  });
  nativeDefineProperty(root, 'Date', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Date,
  });
  nativeFreeze(Date);
  nativeFreeze(Date.prototype);
  nativeFreeze(performance);

  installAuthorSandbox({
    allowedUrls: input.allowedUrls,
    activity: authorActivity,
    reportActivity,
  });

  nativeApply(nativeStorageSetItem, sessionStorage, [
    '__prodivix_verification_namespace__',
    input.namespace,
  ]);
  nativeApply(nativeStorageSetItem, sessionStorage, [
    '__prodivix_fixture_binding__',
    input.fixtureBindingDigest,
  ]);
  nativeApply(nativeStorageSetItem, sessionStorage, [
    '__prodivix_executable_snapshot__',
    input.executableSnapshotDigest,
  ]);

  const readStorage = async () => {
    const databases =
      nativeIndexedDbDatabases === undefined
        ? []
        : await nativeIndexedDbDatabases();
    const cacheKeys =
      nativeCacheKeys === undefined ? [] : await nativeCacheKeys();
    const registrations =
      nativeServiceWorkerRegistrations === undefined
        ? []
        : await nativeServiceWorkerRegistrations();
    const sessionStorageEntries =
      nativeStorageLength === undefined
        ? sessionStorage.length
        : (nativeApply(nativeStorageLength, sessionStorage, []) as number);
    const sessionStorageKeys = Array.from(
      { length: sessionStorageEntries },
      (_, index) =>
        nativeApply(nativeStorageKey, sessionStorage, [index]) as string | null
    )
      .filter((key): key is string => key !== null)
      .sort();
    return {
      localStorageEntries:
        nativeStorageLength === undefined
          ? localStorage.length
          : (nativeApply(nativeStorageLength, localStorage, []) as number),
      sessionStorageEntries,
      sessionStorageKeys,
      indexedDbDatabases: databases.length,
      cacheStorageEntries: cacheKeys.length,
      serviceWorkerRegistrations: registrations.length,
    };
  };
  const readActiveAnimations = (): number =>
    (
      nativeApply(nativeGetAnimations, document, []) as readonly Animation[]
    ).filter(({ playState }) => playState === 'running').length;
  const captureWitness = (): RuntimeWitness => {
    if (!witnessObservation) {
      const observedIdentifierSamples = {
        attempt: nextIdentifier('attempt'),
        step: nextIdentifier('step'),
        action: nextIdentifier('action'),
        operation: input.identifierValues.operation[0]!,
      };
      witnessObservation = {
        expectedRandomSample: input.expectedWitness.randomSample,
        observedRandomSample: Math.random(),
        expectedIdentifierSamples: input.expectedWitness.identifierSamples,
        observedIdentifierSamples,
        expectedOperationUuid: input.expectedWitness.operationUuid,
        observedOperationUuid: controlledOperationUuid(),
      };
      if (!sameWitness(witnessObservation)) {
        throw new Error(
          'Deterministic browser witness was consumed before host observation.'
        );
      }
      cursor.witnessCaptured = true;
      persistCursor();
      reportCursor('witness-captured');
    }
    return witnessObservation;
  };
  // The init script executes before any author script. Reserve and seal the
  // witness now so framework bootstrap code (React included) receives only
  // subsequent deterministic samples and cannot race the Host observation.
  captureWitness();
  const readSnapshot = async (): Promise<PlaywrightRuntimeSnapshot> => {
    await flushReports();
    await fontReadyPromise;
    const witness = captureWitness();
    const storage = await readStorage();
    return {
      ...witness,
      cursor: {
        documentInitializationCount: cursor.documentInitializationCount,
        randomSampleCount: cursor.randomSampleCount,
        identifierSampleCounts: {
          ...cursor.identifierSampleCounts,
        },
        witnessCaptured: cursor.witnessCaptured,
      },
      now: nativeApply(nativeDateNow, Date, []) as number,
      namespace: nativeApply(nativeStorageGetItem, sessionStorage, [
        '__prodivix_verification_namespace__',
      ]) as string | null,
      fixtureBindingDigest: nativeApply(nativeStorageGetItem, sessionStorage, [
        '__prodivix_fixture_binding__',
      ]) as string | null,
      executableSnapshotDigest: nativeApply(
        nativeStorageGetItem,
        sessionStorage,
        ['__prodivix_executable_snapshot__']
      ) as string | null,
      pendingTimers: controllerCountTimers(),
      pendingStreams: authorActivity.activeStreams,
      activeWorkers: authorActivity.activeWorkers,
      authoredAnimationCreationCount:
        authorActivity.authoredAnimationCreationCount,
      authorAnimationFrameCreationCount:
        authorActivity.authorAnimationFrameCreationCount,
      cryptoRandomCreationCount: authorActivity.cryptoRandomCreationCount,
      nativeTimerCreationCount: authorActivity.nativeTimerCreationCount,
      streamCreationCount: authorActivity.streamCreationCount,
      workerCreationCount: authorActivity.workerCreationCount,
      deniedWorkerCreations: authorActivity.deniedWorkerCreations,
      deniedRequests: authorActivity.deniedRequests,
      authorRequestCreationCount: authorActivity.authorRequestCreationCount,
      virtualAnimationTimeMs: controllerPerformanceNow() - animationClockOrigin,
      animationClockSyncCount,
      storage,
      rendering: {
        ...capturedViewport,
        colorScheme: nativeMatchMedia('(prefers-color-scheme: dark)').matches
          ? ('dark' as const)
          : ('light' as const),
        motion: nativeMatchMedia('(prefers-reduced-motion: reduce)').matches
          ? ('reduced' as const)
          : ('full' as const),
        fontReady:
          nativeFontStatusGetter !== undefined &&
          nativeApply(nativeFontStatusGetter, fontSet, []) === 'loaded',
        activeAnimations: readActiveAnimations(),
        origin: nativeLocationOrigin,
      },
    };
  };
  const settle = async (
    maximumFrames: number,
    needsStableFrames: boolean
  ): Promise<PlaywrightRuntimeSettleResult> => {
    await fontReadyPromise;
    const before = nativePerformanceNow();
    let observedFrames = 0;
    let animationFrameTimestamp = before;
    const minimumFrames = needsStableFrames ? 2 : 1;
    while (observedFrames < maximumFrames) {
      animationFrameTimestamp = await new nativePromise<number>(
        (resolvePromise) =>
          nativeRequestAnimationFrame((timestamp) => resolvePromise(timestamp))
      );
      observedFrames += 1;
      const snapshot = await readSnapshot();
      if (
        observedFrames >= minimumFrames &&
        snapshot.rendering.fontReady &&
        snapshot.rendering.activeAnimations === 0 &&
        snapshot.pendingTimers === 0 &&
        snapshot.pendingStreams === 0 &&
        snapshot.activeWorkers === 0
      ) {
        return {
          snapshot,
          observedFrames,
          timeOrigin: nativeTimeOrigin,
          performanceNowDelta: nativePerformanceNow() - before,
          animationFrameTimestamp,
        };
      }
    }
    throw new Error(
      'Deterministic browser semantic settle exceeded its frame budget.'
    );
  };

  const bridge = async (
    capability: string,
    action: 'snapshot' | 'settle' | 'sync-clock',
    argument?: unknown
  ): Promise<PlaywrightRuntimeProbeResponse> => {
    if (capability !== input.probeCapability) {
      reportActivity('clock-control-attempted');
      throw new Error('Deterministic browser control capability was denied.');
    }
    if (action === 'snapshot') return readSnapshot();
    if (action === 'settle') {
      const settleInput = argument as
        { maximumFrames?: unknown; needsStableFrames?: unknown } | undefined;
      if (
        !settleInput ||
        !nativeIsSafeInteger(settleInput.maximumFrames) ||
        (settleInput.maximumFrames as number) < 1 ||
        typeof settleInput.needsStableFrames !== 'boolean'
      ) {
        throw new Error('Deterministic browser settle input is invalid.');
      }
      return settle(
        settleInput.maximumFrames as number,
        settleInput.needsStableFrames
      );
    }
    if (action === 'sync-clock') {
      if (!animationClockInitialized) {
        if (
          !nativeIsSafeInteger(argument) ||
          (argument as number) < 0 ||
          pendingClockControls.length !== 0
        ) {
          throw new Error(
            'Deterministic animation Clock initialization drifted.'
          );
        }
        const target = argument as number;
        animationClockOrigin = controllerPerformanceNow() - target;
        virtualAnimationTimeMs = target;
        animationClockInitialized = true;
        animationClockSyncCount += 1;
        await flushReports();
        return {
          status: 'synced',
          virtualAnimationTimeMs,
        };
      }
      if (
        !nativeIsSafeInteger(argument) ||
        (argument as number) < virtualAnimationTimeMs
      ) {
        throw new Error('Deterministic animation Clock moved backwards.');
      }
      const target = argument as number;
      const expectedDelta = target - virtualAnimationTimeMs;
      if (
        (expectedDelta === 0 && pendingClockControls.length !== 0) ||
        (expectedDelta > 0 &&
          (pendingClockControls.length !== 1 ||
            pendingClockControls[0]?.method !== 'fastForward' ||
            pendingClockControls[0].ticks !== expectedDelta)) ||
        controllerPerformanceNow() - animationClockOrigin !== target
      ) {
        throw new Error(
          'Deterministic animation Clock transcript drifted from Core logical time.'
        );
      }
      pendingClockControls.length = 0;
      virtualAnimationTimeMs = target;
      animationClockSyncCount += 1;
      await flushReports();
      return {
        status: 'synced',
        virtualAnimationTimeMs,
      };
    }
    throw new Error('Deterministic browser control action is unsupported.');
  };
  nativeDefineProperty(root, input.probeKey, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: nativeFreeze(bridge),
  });
};

export const installPlaywrightDeterministicControlInit = async (
  context: BrowserContext,
  input: PlaywrightRuntimeControlInitInput,
  probes: Readonly<{
    performance: PlaywrightPerformanceProbeBinding;
    trustedPage: TrustedPageProbeBinding;
  }>
): Promise<void> => {
  await context.addInitScript({
    content: [
      createTrustedAxeInitSource(),
      `;(${String(initTrustedPerformanceProbe)})(${JSON.stringify(
        createPlaywrightPerformanceProbeInitInput(probes.performance)
      )});`,
      `;(${String(initTrustedPageProbe)})(${JSON.stringify(probes.trustedPage)});`,
      `;(${String(installRuntimeControlInit)})(${JSON.stringify(input)},(${String(installPlaywrightDeterministicAuthorSandbox)}));`,
    ].join('\n'),
  });
};
