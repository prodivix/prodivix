import { randomUUID } from 'node:crypto';
import type { Page } from 'playwright-core';
import {
  BrowserPrivatePayloadError,
  strictArray,
  strictEnum,
  strictFiniteNumber,
  strictObject,
  strictSafeInteger,
} from '../privateBoundary';

export type PlaywrightPerformanceProbeBinding = Readonly<{
  propertyKey: string;
  capability: string;
}>;

export type PlaywrightTrustedPerformanceObservation = Readonly<{
  navigationDuration: number;
  navigationEntryCount: number;
  resourceCount: number;
  resourceBytes: number;
  longTaskCount: number;
  totalBlockingTime: number;
  lcp: number;
  lcpEntryCount: number;
  cls: number;
  inp: number;
  missedFrames: number;
  frameRate: number;
  frameCount: number;
  trustedInteractionCount: number;
  supportedEntryTypes: readonly string[];
}>;

const ENTRY_TYPES = [
  'event',
  'largest-contentful-paint',
  'layout-shift',
  'longtask',
  'navigation',
  'resource',
] as const;

export const PLAYWRIGHT_EVENT_DURATION_THRESHOLD_MS = 16;

export const initTrustedPerformanceProbe = (binding: {
  propertyKey: string;
  capability: string;
  eventDurationThresholdMs: number;
}): void => {
  const root = globalThis as unknown as Record<string, unknown>;
  const clockBuiltins = (
    root['__pwClock'] as
      | Readonly<{
          builtins?: Readonly<{
            requestAnimationFrame?: (
              callback: (timestamp: number) => void
            ) => number;
            performance?: Performance;
          }>;
        }>
      | undefined
  )?.builtins;
  const NativePerformanceObserver = root['PerformanceObserver'] as
    | (new (callback: (list: object) => void) => {
        observe(options: object): void;
        takeRecords(): readonly object[];
      })
    | undefined;
  const NativeEntryList = root['PerformanceObserverEntryList'] as
    { prototype?: object } | undefined;
  const nativeRequestAnimationFrame =
    clockBuiltins?.requestAnimationFrame ??
    (root['requestAnimationFrame'] as
      ((callback: (time: number) => void) => number) | undefined);
  const nativeApply = Reflect.apply;
  const nativeDefineProperty = Object.defineProperty;
  const nativeFreeze = Object.freeze;
  const nativeGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
  const nativeGetPrototypeOf = Object.getPrototypeOf;
  const nativeHasOwn = Object.hasOwn;
  const nativeFunctionToString = Function.prototype.toString;
  const nativeStringIncludes = String.prototype.includes;
  const nativeIsFinite = Number.isFinite;
  const NativePromise = Promise;
  const NativeEventTarget = root['EventTarget'] as
    (new () => EventTarget) | undefined;
  const NativeEvent = root['Event'] as
    (new (type: string) => Event) | undefined;
  const documentRef = root['document'] as Document | undefined;
  const nativeAddEventListener =
    NativeEventTarget === undefined
      ? undefined
      : Object.getOwnPropertyDescriptor(
          NativeEventTarget.prototype,
          'addEventListener'
        )?.value;
  const nativeIsTrustedGetter =
    NativeEvent === undefined
      ? undefined
      : Object.getOwnPropertyDescriptor(
          new NativeEvent('prodivix-trusted-performance'),
          'isTrusted'
        )?.get;
  const performanceRef =
    clockBuiltins?.performance ??
    (root['performance'] as Performance | undefined);
  const performancePrototype =
    performanceRef === undefined
      ? undefined
      : nativeGetPrototypeOf(performanceRef);
  const nativePerformanceNow =
    performancePrototype === undefined
      ? undefined
      : nativeGetOwnPropertyDescriptor(performancePrototype, 'now')?.value;
  const nativeTimeOriginGetter =
    performancePrototype === undefined
      ? undefined
      : nativeGetOwnPropertyDescriptor(performancePrototype, 'timeOrigin')?.get;
  const observerPrototype = NativePerformanceObserver?.prototype;
  const nativeObserve =
    observerPrototype === undefined
      ? undefined
      : nativeGetOwnPropertyDescriptor(observerPrototype, 'observe')?.value;
  const nativeTakeRecords =
    observerPrototype === undefined
      ? undefined
      : nativeGetOwnPropertyDescriptor(observerPrototype, 'takeRecords')?.value;
  const entryListPrototype = NativeEntryList?.prototype;
  const nativeGetEntries =
    entryListPrototype === undefined
      ? undefined
      : nativeGetOwnPropertyDescriptor(entryListPrototype, 'getEntries')?.value;
  const observers: Array<{
    observer: object;
    process(entries: readonly object[]): void;
  }> = [];
  const supportedEntryTypes: string[] = [];
  const observation = {
    navigationDuration: 0,
    navigationEntryCount: 0,
    resourceCount: 0,
    resourceBytes: 0,
    longTaskCount: 0,
    totalBlockingTime: 0,
    lcp: 0,
    lcpEntryCount: 0,
    cls: 0,
    inp: 0,
  };
  let navigationObserved = false;
  let trustedInteractionCount = 0;
  let trustedInteractionBaseline = 0;

  const observeTrustedInteraction = (event: Event): void => {
    if (
      nativeIsTrustedGetter !== undefined &&
      nativeApply(nativeIsTrustedGetter, event, []) === true &&
      trustedInteractionCount < 1_000_000
    ) {
      trustedInteractionCount += 1;
    }
  };
  if (
    nativeIsTrustedGetter !== undefined &&
    typeof nativeAddEventListener === 'function' &&
    documentRef !== undefined
  ) {
    nativeApply(nativeAddEventListener, documentRef, [
      'click',
      observeTrustedInteraction,
      true,
    ]);
    nativeApply(nativeAddEventListener, documentRef, [
      'keydown',
      observeTrustedInteraction,
      true,
    ]);
  }

  const nativeProperty = (entry: object, property: string): unknown => {
    let candidate: object | null = entry;
    while (candidate !== null) {
      const descriptor = nativeGetOwnPropertyDescriptor(candidate, property);
      if (descriptor !== undefined) {
        if (descriptor.get !== undefined) {
          const source = nativeApply(
            nativeFunctionToString,
            descriptor.get,
            []
          );
          if (
            typeof source !== 'string' ||
            !nativeApply(nativeStringIncludes, source, ['[native code]'])
          ) {
            return undefined;
          }
          return nativeApply(descriptor.get, entry, []);
        }
        if (candidate === entry && nativeHasOwn(descriptor, 'value')) {
          return descriptor.value;
        }
        return undefined;
      }
      candidate = nativeGetPrototypeOf(candidate);
    }
    return undefined;
  };

  const finiteNumber = (value: unknown): number | undefined =>
    typeof value === 'number' && nativeIsFinite(value) && value >= 0
      ? value
      : undefined;

  const observe = (
    type: (typeof ENTRY_TYPES)[number],
    process: (entries: readonly object[]) => void
  ): void => {
    if (
      NativePerformanceObserver === undefined ||
      typeof nativeObserve !== 'function' ||
      typeof nativeTakeRecords !== 'function' ||
      typeof nativeGetEntries !== 'function'
    ) {
      return;
    }
    try {
      const observer = new NativePerformanceObserver((list) => {
        const entries = nativeApply(nativeGetEntries, list, []) as
          readonly object[] | undefined;
        if (entries !== undefined) process(entries);
      });
      nativeApply(nativeObserve, observer, [
        type === 'event'
          ? {
              type,
              buffered: true,
              durationThreshold: binding.eventDurationThresholdMs,
            }
          : { type, buffered: true },
      ]);
      observers[observers.length] = { observer, process };
      supportedEntryTypes[supportedEntryTypes.length] = type;
    } catch {
      // Unsupported entry types remain absent and fail closed in Node.
    }
  };

  observe('navigation', (entries) => {
    for (let index = 0; index < entries.length; index += 1) {
      const duration = finiteNumber(
        nativeProperty(entries[index]!, 'duration')
      );
      if (duration === undefined) continue;
      if (!navigationObserved) {
        navigationObserved = true;
        observation.navigationEntryCount = 1;
      }
      if (duration > observation.navigationDuration) {
        observation.navigationDuration = duration;
      }
    }
  });
  observe('resource', (entries) => {
    for (let index = 0; index < entries.length; index += 1) {
      const transferSize = finiteNumber(
        nativeProperty(entries[index]!, 'transferSize')
      );
      if (transferSize === undefined) continue;
      observation.resourceCount += 1;
      observation.resourceBytes += transferSize;
    }
  });
  observe('longtask', (entries) => {
    for (let index = 0; index < entries.length; index += 1) {
      const duration = finiteNumber(
        nativeProperty(entries[index]!, 'duration')
      );
      if (duration === undefined) continue;
      observation.longTaskCount += 1;
      observation.totalBlockingTime += duration > 50 ? duration - 50 : 0;
    }
  });
  observe('largest-contentful-paint', (entries) => {
    for (let index = 0; index < entries.length; index += 1) {
      const startTime = finiteNumber(
        nativeProperty(entries[index]!, 'startTime')
      );
      if (startTime !== undefined) {
        observation.lcpEntryCount += 1;
        if (startTime > observation.lcp) {
          observation.lcp = startTime;
        }
      }
    }
  });
  observe('layout-shift', (entries) => {
    for (let index = 0; index < entries.length; index += 1) {
      const value = finiteNumber(nativeProperty(entries[index]!, 'value'));
      const hadRecentInput = nativeProperty(entries[index]!, 'hadRecentInput');
      if (value !== undefined && hadRecentInput === false) {
        observation.cls += value;
      }
    }
  });
  observe('event', (entries) => {
    for (let index = 0; index < entries.length; index += 1) {
      const duration = finiteNumber(
        nativeProperty(entries[index]!, 'duration')
      );
      if (duration !== undefined && duration > observation.inp) {
        observation.inp = duration;
      }
    }
  });

  let frameSampling = false;
  let frameComplete = false;
  let firstFrameTime: number | undefined;
  let previousFrameTime: number | undefined;
  let frameDuration = 0;
  let frameCount = 0;
  let missedFrames = 0;

  const onAnimationFrame = (time: number): void => {
    if (!frameSampling || !nativeIsFinite(time)) return;
    if (firstFrameTime === undefined) firstFrameTime = time;
    if (previousFrameTime !== undefined) {
      const delta = time - previousFrameTime;
      if (nativeIsFinite(delta) && delta >= 0) {
        frameDuration += delta;
        frameCount += 1;
        if (delta > 25) missedFrames += 1;
      }
    }
    previousFrameTime = time;
    nativeApply(nativeRequestAnimationFrame!, globalThis, [onAnimationFrame]);
  };

  const flushObservers = (): void => {
    for (let index = 0; index < observers.length; index += 1) {
      const entry = observers[index]!;
      const records = nativeApply(nativeTakeRecords, entry.observer, []) as
        readonly object[] | undefined;
      if (records !== undefined && records.length > 0) entry.process(records);
    }
  };

  const probe = (
    capability: string,
    action:
      | 'start-frame-sample'
      | 'stop-frame-sample'
      | 'reset-observation'
      | 'snapshot'
      | 'monotonic-now'
  ): unknown => {
    if (capability !== binding.capability) return undefined;
    if (action === 'monotonic-now') {
      if (
        performanceRef === undefined ||
        typeof nativePerformanceNow !== 'function' ||
        nativeTimeOriginGetter === undefined
      ) {
        return nativeFreeze({ status: 'unavailable' });
      }
      const timeOrigin = nativeApply(
        nativeTimeOriginGetter,
        performanceRef,
        []
      ) as number;
      const now = nativeApply(
        nativePerformanceNow,
        performanceRef,
        []
      ) as number;
      return nativeIsFinite(timeOrigin) && nativeIsFinite(now)
        ? nativeFreeze({
            status: 'complete',
            timestampMs: timeOrigin + now,
          })
        : nativeFreeze({ status: 'unavailable' });
    }
    if (action === 'reset-observation') {
      if (frameSampling) {
        return nativeFreeze({ status: 'unavailable' });
      }
      flushObservers();
      observation.longTaskCount = 0;
      observation.totalBlockingTime = 0;
      observation.cls = 0;
      observation.inp = 0;
      trustedInteractionBaseline = trustedInteractionCount;
      return nativeFreeze({ status: 'reset' });
    }
    if (action === 'start-frame-sample') {
      if (frameSampling || typeof nativeRequestAnimationFrame !== 'function') {
        return nativeFreeze({ status: 'unavailable' });
      }
      frameComplete = false;
      firstFrameTime = undefined;
      previousFrameTime = undefined;
      frameDuration = 0;
      frameCount = 0;
      missedFrames = 0;
      frameSampling = true;
      return new NativePromise((resolve) => {
        nativeApply(nativeRequestAnimationFrame, globalThis, [
          (time: number) => {
            onAnimationFrame(time);
            resolve(nativeFreeze({ status: 'started' }));
          },
        ]);
      });
    }
    if (action === 'stop-frame-sample') {
      if (!frameSampling && !frameComplete) {
        return nativeFreeze({ status: 'unavailable' });
      }
      if (frameComplete) {
        return nativeFreeze({ status: 'stopped' });
      }
      if (typeof nativeRequestAnimationFrame !== 'function') {
        return nativeFreeze({ status: 'unavailable' });
      }
      return new NativePromise((resolve) => {
        nativeApply(nativeRequestAnimationFrame, globalThis, [
          () => {
            frameSampling = false;
            frameComplete = frameCount >= 1;
            resolve(
              frameComplete
                ? nativeFreeze({ status: 'stopped' })
                : nativeFreeze({ status: 'unavailable' })
            );
          },
        ]);
      });
    }
    if (action !== 'snapshot' || !frameComplete || frameCount < 1) {
      return nativeFreeze({ status: 'unavailable' });
    }
    flushObservers();
    const supportedCopy: string[] = [];
    for (let index = 0; index < supportedEntryTypes.length; index += 1) {
      supportedCopy[index] = supportedEntryTypes[index]!;
    }
    const supported = nativeFreeze(supportedCopy);
    return nativeFreeze({
      status: 'complete',
      format: 'prodivix.trusted-browser-performance-observation',
      version: 1,
      integrity: 'pre-author-native-capture-v1',
      navigationDuration: observation.navigationDuration,
      navigationEntryCount: observation.navigationEntryCount,
      resourceCount: observation.resourceCount,
      resourceBytes: observation.resourceBytes,
      longTaskCount: observation.longTaskCount,
      totalBlockingTime: observation.totalBlockingTime,
      lcp: observation.lcp,
      lcpEntryCount: observation.lcpEntryCount,
      cls: observation.cls,
      inp: observation.inp,
      missedFrames,
      frameRate: frameDuration > 0 ? (frameCount * 1_000) / frameDuration : 0,
      frameCount,
      trustedInteractionCount:
        trustedInteractionCount - trustedInteractionBaseline,
      supportedEntryTypes: supported,
    });
  };

  nativeDefineProperty(root, binding.propertyKey, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: nativeFreeze(probe),
  });
};

export const createPlaywrightPerformanceProbeBinding =
  (): PlaywrightPerformanceProbeBinding =>
    Object.freeze({
      propertyKey: `pdxTrustedPerformance_${randomUUID().replaceAll('-', '')}`,
      capability: randomUUID(),
    });

export const createPlaywrightPerformanceProbeInitInput = (
  binding: PlaywrightPerformanceProbeBinding
) =>
  Object.freeze({
    ...binding,
    eventDurationThresholdMs: PLAYWRIGHT_EVENT_DURATION_THRESHOLD_MS,
  });

export const installPlaywrightPerformanceProbe = async (
  page: Page
): Promise<PlaywrightPerformanceProbeBinding> => {
  const binding = createPlaywrightPerformanceProbeBinding();
  await page.addInitScript(
    initTrustedPerformanceProbe,
    createPlaywrightPerformanceProbeInitInput(binding)
  );
  return binding;
};

const invokeProbe = (
  page: Page,
  binding: PlaywrightPerformanceProbeBinding,
  action:
    | 'start-frame-sample'
    | 'stop-frame-sample'
    | 'reset-observation'
    | 'snapshot'
    | 'monotonic-now'
): Promise<unknown> =>
  page.evaluate(
    ({ propertyKey, capability, requestedAction }) => {
      const probe = (globalThis as unknown as Record<string, unknown>)[
        propertyKey
      ];
      return typeof probe === 'function'
        ? probe(capability, requestedAction)
        : undefined;
    },
    {
      propertyKey: binding.propertyKey,
      capability: binding.capability,
      requestedAction: action,
    }
  );

const decodeObservation = (
  source: unknown
): PlaywrightTrustedPerformanceObservation => {
  const value = strictObject(source, '$', [
    'status',
    'format',
    'version',
    'integrity',
    'navigationDuration',
    'navigationEntryCount',
    'resourceCount',
    'resourceBytes',
    'longTaskCount',
    'totalBlockingTime',
    'lcp',
    'lcpEntryCount',
    'cls',
    'inp',
    'missedFrames',
    'frameRate',
    'frameCount',
    'trustedInteractionCount',
    'supportedEntryTypes',
  ]);
  strictEnum(value.status, '$.status', ['complete'] as const);
  strictEnum(value.format, '$.format', [
    'prodivix.trusted-browser-performance-observation',
  ] as const);
  if (value.version !== 1) {
    throw new BrowserPrivatePayloadError(
      'partial-result',
      '$.version',
      'Trusted browser performance observation version is unsupported.'
    );
  }
  strictEnum(value.integrity, '$.integrity', [
    'pre-author-native-capture-v1',
  ] as const);
  const supportedEntryTypes = strictArray(
    value.supportedEntryTypes,
    '$.supportedEntryTypes',
    ENTRY_TYPES.length
  ).map((entry, index) =>
    strictEnum(entry, `$.supportedEntryTypes[${index}]`, ENTRY_TYPES)
  );
  if (new Set(supportedEntryTypes).size !== supportedEntryTypes.length) {
    throw new BrowserPrivatePayloadError(
      'duplicate-identity',
      '$.supportedEntryTypes',
      'Trusted performance entry types must be unique.'
    );
  }
  const finite = (
    field:
      | 'navigationDuration'
      | 'resourceBytes'
      | 'totalBlockingTime'
      | 'lcp'
      | 'cls'
      | 'inp'
      | 'frameRate'
  ) =>
    strictFiniteNumber(value[field], `$.${field}`, {
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
    });
  return Object.freeze({
    navigationDuration: finite('navigationDuration'),
    navigationEntryCount: strictSafeInteger(
      value.navigationEntryCount,
      '$.navigationEntryCount',
      { minimum: 0, maximum: 1_000_000 }
    ),
    resourceCount: strictSafeInteger(value.resourceCount, '$.resourceCount', {
      minimum: 0,
      maximum: 1_000_000,
    }),
    resourceBytes: finite('resourceBytes'),
    longTaskCount: strictSafeInteger(value.longTaskCount, '$.longTaskCount', {
      minimum: 0,
      maximum: 1_000_000,
    }),
    totalBlockingTime: finite('totalBlockingTime'),
    lcp: finite('lcp'),
    lcpEntryCount: strictSafeInteger(value.lcpEntryCount, '$.lcpEntryCount', {
      minimum: 0,
      maximum: 1_000_000,
    }),
    cls: finite('cls'),
    inp: finite('inp'),
    missedFrames: strictSafeInteger(value.missedFrames, '$.missedFrames', {
      minimum: 0,
      maximum: 1_000_000,
    }),
    frameRate: finite('frameRate'),
    frameCount: strictSafeInteger(value.frameCount, '$.frameCount', {
      minimum: 1,
      maximum: 1_000_000,
    }),
    trustedInteractionCount: strictSafeInteger(
      value.trustedInteractionCount,
      '$.trustedInteractionCount',
      { minimum: 0, maximum: 1_000_000 }
    ),
    supportedEntryTypes: Object.freeze(supportedEntryTypes),
  });
};

export const readPlaywrightTrustedMonotonicTimestamp = async (
  page: Page,
  binding: PlaywrightPerformanceProbeBinding
): Promise<number> => {
  const result = strictObject(
    await invokeProbe(page, binding, 'monotonic-now'),
    '$',
    ['status', 'timestampMs']
  );
  strictEnum(result.status, '$.status', ['complete'] as const);
  return strictFiniteNumber(result.timestampMs, '$.timestampMs', {
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER,
  });
};

export const armPlaywrightTrustedPerformanceObservation = async (
  page: Page,
  binding: PlaywrightPerformanceProbeBinding
): Promise<void> => {
  const started = strictObject(
    await invokeProbe(page, binding, 'start-frame-sample'),
    '$',
    ['status']
  );
  strictEnum(started.status, '$.status', ['started'] as const);
};

export const resetPlaywrightTrustedPerformanceObservation = async (
  page: Page,
  binding: PlaywrightPerformanceProbeBinding
): Promise<void> => {
  const reset = strictObject(
    await invokeProbe(page, binding, 'reset-observation'),
    '$',
    ['status']
  );
  strictEnum(reset.status, '$.status', ['reset'] as const);
};

export const finishPlaywrightTrustedPerformanceObservation = async (
  page: Page,
  binding: PlaywrightPerformanceProbeBinding
): Promise<PlaywrightTrustedPerformanceObservation> => {
  const stopped = strictObject(
    await invokeProbe(page, binding, 'stop-frame-sample'),
    '$',
    ['status']
  );
  strictEnum(stopped.status, '$.status', ['stopped'] as const);
  return decodeObservation(await invokeProbe(page, binding, 'snapshot'));
};
