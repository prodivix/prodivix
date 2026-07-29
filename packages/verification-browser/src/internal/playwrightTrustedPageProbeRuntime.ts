import { randomUUID } from 'node:crypto';
import axe from 'axe-core';
import type { Page } from 'playwright-core';

export type TrustedPageProbeBinding = Readonly<{
  propertyKey: string;
  capability: string;
}>;

export type TrustedSemanticTargetIdentity = Readonly<{
  targetId: string;
  documentId: string;
  nodeId: string;
  instancePathSuffix?: string;
}>;

export type TrustedAxeResult = Readonly<{
  violations: readonly Readonly<{
    id: string;
    impact: string | null;
    nodeCount: number;
  }>[];
  incomplete: readonly Readonly<{
    id: string;
    impact: string | null;
    nodeCount: number;
  }>[];
}>;

export type TrustedKeyboardObservation = Readonly<{
  observedTargetId: string;
  focusVisible: boolean;
  focusContained: boolean;
  activated: boolean;
}>;

export type TrustedDynamicAnnouncementObservation = Readonly<{
  triggerTargetId: string;
  announcementTargetId: string;
  role: 'status' | 'alert' | 'log';
  live: 'polite' | 'assertive';
  beforeTextDigest: string;
  afterTextDigest: string;
  outcome: 'matched' | 'timed-out' | 'untrusted-key';
}>;

type TrustedAxeApi = Readonly<{
  run(target: Element): Promise<unknown>;
}>;

export const initTrustedPageProbe = (
  binding: TrustedPageProbeBinding
): void => {
  const root = globalThis as unknown as Record<string, unknown>;
  const clockBuiltins = (
    root['__pwClock'] as
      | Readonly<{
          builtins?: Readonly<{
            setTimeout?: typeof globalThis.setTimeout;
            clearTimeout?: typeof globalThis.clearTimeout;
            performance?: Performance;
          }>;
        }>
      | undefined
  )?.builtins;
  const windowRef = globalThis as unknown as Window;
  const nativeApply = Reflect.apply;
  const nativeDefineProperty = Object.defineProperty;
  const nativeDeleteProperty = Reflect.deleteProperty;
  const nativeFreeze = Object.freeze;
  const nativeIsArray = Array.isArray;
  const nativeStringEndsWith = String.prototype.endsWith;
  const nativeQuerySelectorAll = Document.prototype.querySelectorAll;
  const nativeGetAttribute = Element.prototype.getAttribute;
  const nativeSetAttribute = Element.prototype.setAttribute;
  const nativeRemoveAttribute = Element.prototype.removeAttribute;
  const nativeMatches = Element.prototype.matches;
  const nativeContains = Node.prototype.contains;
  const nativeAddEventListener = EventTarget.prototype.addEventListener;
  const nativeRemoveEventListener = EventTarget.prototype.removeEventListener;
  const NativeMutationObserver = root['MutationObserver'] as
    (new (callback: MutationCallback) => MutationObserver) | undefined;
  const nativeMutationObserve =
    NativeMutationObserver === undefined
      ? undefined
      : Object.getOwnPropertyDescriptor(
          NativeMutationObserver.prototype,
          'observe'
        )?.value;
  const nativeMutationDisconnect =
    NativeMutationObserver === undefined
      ? undefined
      : Object.getOwnPropertyDescriptor(
          NativeMutationObserver.prototype,
          'disconnect'
        )?.value;
  const nativeTextContentGetter = Object.getOwnPropertyDescriptor(
    Node.prototype,
    'textContent'
  )?.get;
  const nativeKeyboardKeyGetter = Object.getOwnPropertyDescriptor(
    KeyboardEvent.prototype,
    'key'
  )?.get;
  const NativeTextEncoder = root['TextEncoder'] as
    (new () => TextEncoder) | undefined;
  const nativeTextEncode =
    NativeTextEncoder === undefined
      ? undefined
      : Object.getOwnPropertyDescriptor(NativeTextEncoder.prototype, 'encode')
          ?.value;
  const subtle = (
    root['crypto'] as Readonly<{ subtle?: SubtleCrypto }> | undefined
  )?.subtle;
  const nativeSubtleDigest =
    subtle === undefined
      ? undefined
      : Object.getOwnPropertyDescriptor(Object.getPrototypeOf(subtle), 'digest')
          ?.value;
  const nativeStringNormalize = String.prototype.normalize;
  const nativeStringTrim = String.prototype.trim;
  const nativeNumberToString = Number.prototype.toString;
  const nativeStringPadStart = String.prototype.padStart;
  const nativeNumberIsSafeInteger = Number.isSafeInteger;
  const nativeMathMin = Math.min;
  const NativePromise = Promise;
  const nativeSetTimeout =
    typeof clockBuiltins?.setTimeout === 'function'
      ? clockBuiltins.setTimeout
      : globalThis.setTimeout;
  const nativeClearTimeout =
    typeof clockBuiltins?.clearTimeout === 'function'
      ? clockBuiltins.clearTimeout
      : globalThis.clearTimeout;
  const performanceRef = clockBuiltins?.performance ?? globalThis.performance;
  const nativePerformanceNow = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(performanceRef),
    'now'
  )?.value;
  const nativeActiveElementGetter = Object.getOwnPropertyDescriptor(
    Document.prototype,
    'activeElement'
  )?.get;
  const nativeBodyGetter = Object.getOwnPropertyDescriptor(
    Document.prototype,
    'body'
  )?.get;
  const nativeFocus = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'focus'
  )?.value;
  const nativeParentElementGetter = Object.getOwnPropertyDescriptor(
    Node.prototype,
    'parentElement'
  )?.get;
  const nativeIsTrustedGetter = Object.getOwnPropertyDescriptor(
    new Event('prodivix-trusted-probe'),
    'isTrusted'
  )?.get;
  const nativeNodeListItem = NodeList.prototype.item;
  const nativeNodeListLengthGetter = Object.getOwnPropertyDescriptor(
    NodeList.prototype,
    'length'
  )?.get;
  const candidateAxeApi = root['axe'];
  const cleanAxeApi =
    typeof candidateAxeApi === 'object' &&
    candidateAxeApi !== null &&
    typeof (candidateAxeApi as { run?: unknown }).run === 'function'
      ? (candidateAxeApi as TrustedAxeApi)
      : undefined;
  let armedElement: Element | undefined;
  let activationListener: EventListener | undefined;
  let activated = false;
  let announcementState:
    | {
        triggerTargetId: string;
        announcementTargetId: string;
        triggerElement: Element;
        announcementElement: Element;
        observer: MutationObserver;
        keyListener: EventListener;
        expectedKey: string;
        expectedTextDigest: string;
        beforeTextDigest: string;
        afterTextDigest: string;
        role: string | null;
        live: string | null;
        mutated: boolean;
        trustedKeyObserved: boolean;
        startedAt: number;
        settleMs: number;
      }
    | undefined;

  const cleanupActivation = (): void => {
    if (armedElement !== undefined && activationListener !== undefined) {
      nativeApply(nativeRemoveEventListener, armedElement, [
        'click',
        activationListener,
      ]);
    }
    armedElement = undefined;
    activationListener = undefined;
    activated = false;
  };

  const cleanupAnnouncement = (): void => {
    if (announcementState === undefined) return;
    if (typeof nativeMutationDisconnect === 'function') {
      nativeApply(nativeMutationDisconnect, announcementState.observer, []);
    }
    nativeApply(nativeRemoveEventListener, announcementState.triggerElement, [
      'keydown',
      announcementState.keyListener,
    ]);
    announcementState = undefined;
  };

  nativeDeleteProperty(root, 'axe');
  if (windowRef.top !== windowRef) return;

  const targetElements = (
    target: TrustedSemanticTargetIdentity
  ): readonly Element[] => {
    const nodes = nativeApply(nativeQuerySelectorAll, document, [
      '[data-pir-document-id][data-pir-node-id]',
    ]) as NodeListOf<Element>;
    const matches: Element[] = [];
    const length =
      nativeNodeListLengthGetter === undefined
        ? 0
        : (nativeApply(nativeNodeListLengthGetter, nodes, []) as number);
    for (let index = 0; index < length; index += 1) {
      const element = nativeApply(nativeNodeListItem, nodes, [
        index,
      ]) as Element | null;
      if (
        element !== null &&
        nativeApply(nativeGetAttribute, element, ['data-pir-document-id']) ===
          target.documentId &&
        nativeApply(nativeGetAttribute, element, ['data-pir-node-id']) ===
          target.nodeId
      ) {
        const instancePath = nativeApply(nativeGetAttribute, element, [
          'data-pir-instance-path',
        ]) as string | null;
        if (
          target.instancePathSuffix === undefined ||
          (instancePath !== null &&
            nativeApply(nativeStringEndsWith, instancePath, [
              target.instancePathSuffix,
            ]) === true)
        ) {
          matches[matches.length] = element;
        }
      }
    }
    return matches;
  };

  const textDigest = async (element: Element): Promise<string | undefined> => {
    if (
      nativeTextContentGetter === undefined ||
      NativeTextEncoder === undefined ||
      typeof nativeTextEncode !== 'function' ||
      subtle === undefined ||
      typeof nativeSubtleDigest !== 'function'
    ) {
      return undefined;
    }
    const text = nativeApply(nativeTextContentGetter, element, []) as
      string | null;
    const normalized = nativeApply(
      nativeStringTrim,
      nativeApply(nativeStringNormalize, text ?? '', ['NFC']),
      []
    ) as string;
    const bytes = nativeApply(nativeTextEncode, new NativeTextEncoder(), [
      normalized,
    ]) as Uint8Array;
    const digest = new Uint8Array(
      (await nativeApply(nativeSubtleDigest, subtle, [
        'SHA-256',
        bytes,
      ])) as ArrayBuffer
    );
    let hex = '';
    for (let index = 0; index < digest.length; index += 1) {
      hex += nativeApply(
        nativeStringPadStart,
        nativeApply(nativeNumberToString, digest[index]!, [16]),
        [2, '0']
      ) as string;
    }
    return `sha256-${hex}`;
  };

  const projectAxeEntries = (
    value: unknown
  ):
    | readonly Readonly<{
        id: string;
        impact: string | null;
        nodeCount: number;
      }>[]
    | undefined => {
    if (!nativeIsArray(value) || value.length > 512) return undefined;
    const entries: Array<{
      id: string;
      impact: string | null;
      nodeCount: number;
    }> = [];
    for (let index = 0; index < value.length; index += 1) {
      const candidate = value[index] as
        { id?: unknown; impact?: unknown; nodes?: unknown } | undefined;
      if (
        candidate === undefined ||
        typeof candidate.id !== 'string' ||
        candidate.id.length === 0 ||
        candidate.id.length > 256 ||
        (candidate.impact !== null && typeof candidate.impact !== 'string') ||
        !nativeIsArray(candidate.nodes) ||
        candidate.nodes.length > 10_000
      ) {
        return undefined;
      }
      entries[entries.length] = nativeFreeze({
        id: candidate.id,
        impact: candidate.impact as string | null,
        nodeCount: candidate.nodes.length,
      });
    }
    return nativeFreeze(entries);
  };

  const bridge = async (
    capability: string,
    request: Readonly<Record<string, unknown>>
  ): Promise<unknown> => {
    if (capability !== binding.capability) return undefined;
    const action = request['action'];
    const target = request['target'] as
      TrustedSemanticTargetIdentity | undefined;
    if (action === 'resolve-target' && target !== undefined) {
      const elements = targetElements(target);
      const allElements = nativeApply(nativeQuerySelectorAll, document, [
        '[data-pir-document-id][data-pir-node-id]',
      ]) as NodeListOf<Element>;
      const allLength =
        nativeNodeListLengthGetter === undefined
          ? 0
          : (nativeApply(
              nativeNodeListLengthGetter,
              allElements,
              []
            ) as number);
      let resolvedIndex = -1;
      if (elements.length === 1) {
        for (let index = 0; index < allLength; index += 1) {
          if (
            nativeApply(nativeNodeListItem, allElements, [index]) ===
            elements[0]
          ) {
            resolvedIndex = index;
            break;
          }
        }
      }
      return nativeFreeze({
        status:
          elements.length === 0
            ? 'none'
            : elements.length === 1
              ? 'single'
              : 'multiple',
        index: resolvedIndex,
      });
    }
    if (
      action === 'axe-scan' &&
      target !== undefined &&
      cleanAxeApi !== undefined
    ) {
      const elements = targetElements(target);
      if (elements.length !== 1) {
        return nativeFreeze({ status: 'unavailable' });
      }
      const result = (await nativeApply(cleanAxeApi.run, cleanAxeApi, [
        elements[0],
      ])) as { violations?: unknown; incomplete?: unknown };
      const violations = projectAxeEntries(result?.violations);
      const incomplete = projectAxeEntries(result?.incomplete);
      return violations === undefined || incomplete === undefined
        ? nativeFreeze({ status: 'unavailable' })
        : nativeFreeze({
            status: 'complete',
            violations,
            incomplete,
          });
    }
    if (action === 'arm-activation' && target !== undefined) {
      cleanupActivation();
      const elements = targetElements(target);
      if (elements.length !== 1 || nativeIsTrustedGetter === undefined) {
        return nativeFreeze({ status: 'unavailable' });
      }
      armedElement = elements[0];
      activationListener = (event: Event) => {
        if (nativeApply(nativeIsTrustedGetter, event, []) === true) {
          activated = true;
        }
      };
      nativeApply(nativeAddEventListener, armedElement, [
        'click',
        activationListener,
      ]);
      return nativeFreeze({ status: 'armed' });
    }
    if (action === 'arm-announcement') {
      cleanupAnnouncement();
      const trigger = request['trigger'] as
        TrustedSemanticTargetIdentity | undefined;
      const announcement = request['announcement'] as
        TrustedSemanticTargetIdentity | undefined;
      const expectedKey = request['expectedKey'];
      const expectedTextDigest = request['expectedTextDigest'];
      const settleMs = request['settleMs'];
      if (
        trigger === undefined ||
        announcement === undefined ||
        typeof expectedKey !== 'string' ||
        typeof expectedTextDigest !== 'string' ||
        typeof settleMs !== 'number' ||
        !nativeNumberIsSafeInteger(settleMs) ||
        settleMs < 1 ||
        settleMs > 60_000 ||
        NativeMutationObserver === undefined ||
        typeof nativeMutationObserve !== 'function' ||
        typeof nativeMutationDisconnect !== 'function' ||
        nativeKeyboardKeyGetter === undefined ||
        nativeIsTrustedGetter === undefined ||
        typeof nativePerformanceNow !== 'function'
      ) {
        return nativeFreeze({ status: 'unavailable' });
      }
      const triggers = targetElements(trigger);
      const announcements = targetElements(announcement);
      if (triggers.length !== 1 || announcements.length !== 1) {
        return nativeFreeze({ status: 'unavailable' });
      }
      const beforeTextDigest = await textDigest(announcements[0]!);
      if (beforeTextDigest === undefined) {
        return nativeFreeze({ status: 'unavailable' });
      }
      const state = {
        triggerTargetId: trigger.targetId,
        announcementTargetId: announcement.targetId,
        triggerElement: triggers[0]!,
        announcementElement: announcements[0]!,
        observer: undefined as unknown as MutationObserver,
        keyListener: undefined as unknown as EventListener,
        expectedKey,
        expectedTextDigest,
        beforeTextDigest,
        afterTextDigest: beforeTextDigest,
        role: nativeApply(nativeGetAttribute, announcements[0], ['role']) as
          string | null,
        live: nativeApply(nativeGetAttribute, announcements[0], [
          'aria-live',
        ]) as string | null,
        mutated: false,
        trustedKeyObserved: false,
        startedAt: nativeApply(
          nativePerformanceNow,
          performanceRef,
          []
        ) as number,
        settleMs,
      };
      state.keyListener = (event: Event) => {
        if (
          nativeApply(nativeIsTrustedGetter, event, []) === true &&
          nativeApply(nativeKeyboardKeyGetter, event, []) === state.expectedKey
        ) {
          state.trustedKeyObserved = true;
        }
      };
      state.observer = new NativeMutationObserver(() => {
        state.mutated = true;
      });
      nativeApply(nativeAddEventListener, triggers[0], [
        'keydown',
        state.keyListener,
      ]);
      nativeApply(nativeMutationObserve, state.observer, [
        state.announcementElement,
        {
          attributes: true,
          characterData: true,
          childList: true,
          subtree: true,
        },
      ]);
      announcementState = state;
      return nativeFreeze({ status: 'armed' });
    }
    if (action === 'observe-announcement') {
      const state = announcementState;
      if (state === undefined || typeof nativePerformanceNow !== 'function') {
        return nativeFreeze({ status: 'unavailable' });
      }
      return new NativePromise((resolve) => {
        let timeoutHandle: number | undefined;
        let complete = false;
        const finish = (
          outcome: 'matched' | 'timed-out' | 'untrusted-key'
        ): void => {
          if (complete) return;
          complete = true;
          if (timeoutHandle !== undefined) {
            nativeApply(nativeClearTimeout, globalThis, [timeoutHandle]);
          }
          const response = nativeFreeze({
            status: 'complete',
            triggerTargetId: state.triggerTargetId,
            announcementTargetId: state.announcementTargetId,
            role: state.role,
            live: state.live,
            beforeTextDigest: state.beforeTextDigest,
            afterTextDigest: state.afterTextDigest,
            outcome,
          });
          cleanupAnnouncement();
          resolve(response);
        };
        const poll = async (): Promise<void> => {
          const afterTextDigest = await textDigest(state.announcementElement);
          if (afterTextDigest === undefined) {
            finish('timed-out');
            return;
          }
          state.afterTextDigest = afterTextDigest;
          if (
            state.mutated &&
            state.trustedKeyObserved &&
            afterTextDigest === state.expectedTextDigest &&
            afterTextDigest !== state.beforeTextDigest
          ) {
            finish('matched');
            return;
          }
          const now = nativeApply(
            nativePerformanceNow,
            performanceRef,
            []
          ) as number;
          if (now - state.startedAt >= state.settleMs) {
            finish(state.trustedKeyObserved ? 'timed-out' : 'untrusted-key');
            return;
          }
          timeoutHandle = nativeApply(nativeSetTimeout, globalThis, [
            () => {
              void poll();
            },
            nativeApply(nativeMathMin, Math, [16, state.settleMs]) as number,
          ]) as number;
        };
        void poll();
      });
    }
    if (
      action === 'observe-keyboard' &&
      target !== undefined &&
      nativeActiveElementGetter !== undefined &&
      nativeParentElementGetter !== undefined
    ) {
      const targets = request['targets'];
      if (!nativeIsArray(targets) || targets.length > 2_048) {
        cleanupActivation();
        return nativeFreeze({ status: 'unavailable' });
      }
      const active = nativeApply(
        nativeActiveElementGetter,
        document,
        []
      ) as Element | null;
      const expectedElements = targetElements(target);
      let current = active;
      let observedTargetId: string | undefined;
      while (current !== null && observedTargetId === undefined) {
        for (let index = 0; index < targets.length; index += 1) {
          const candidate = targets[index] as TrustedSemanticTargetIdentity;
          const candidateElements = targetElements(candidate);
          for (
            let candidateIndex = 0;
            candidateIndex < candidateElements.length;
            candidateIndex += 1
          ) {
            if (candidateElements[candidateIndex] === current) {
              observedTargetId = candidate.targetId;
              break;
            }
          }
          if (observedTargetId !== undefined) break;
        }
        current = nativeApply(
          nativeParentElementGetter,
          current,
          []
        ) as Element | null;
      }
      const response =
        active === null ||
        observedTargetId === undefined ||
        expectedElements.length !== 1
          ? nativeFreeze({ status: 'unavailable' })
          : nativeFreeze({
              status: 'complete',
              observedTargetId,
              focusVisible:
                nativeApply(nativeMatches, active, [':focus-visible']) === true,
              focusContained:
                nativeApply(nativeContains, expectedElements[0]!, [active]) ===
                true,
              activated,
            });
      cleanupActivation();
      return response;
    }
    if (action === 'reset-keyboard-focus') {
      cleanupActivation();
      cleanupAnnouncement();
      if (nativeBodyGetter === undefined || typeof nativeFocus !== 'function') {
        return nativeFreeze({ status: 'unavailable' });
      }
      const body = nativeApply(
        nativeBodyGetter,
        document,
        []
      ) as HTMLElement | null;
      if (body === null) {
        return nativeFreeze({ status: 'unavailable' });
      }
      const previousTabIndex = nativeApply(nativeGetAttribute, body, [
        'tabindex',
      ]) as string | null;
      try {
        nativeApply(nativeSetAttribute, body, ['tabindex', '-1']);
        nativeApply(nativeFocus, body, []);
      } catch {
        return nativeFreeze({ status: 'unavailable' });
      } finally {
        if (previousTabIndex === null) {
          nativeApply(nativeRemoveAttribute, body, ['tabindex']);
        } else {
          nativeApply(nativeSetAttribute, body, ['tabindex', previousTabIndex]);
        }
      }
      return nativeFreeze({ status: 'clean' });
    }
    if (action === 'cleanup-activation') {
      cleanupActivation();
      return nativeFreeze({ status: 'clean' });
    }
    if (action === 'cleanup-announcement') {
      cleanupAnnouncement();
      return nativeFreeze({ status: 'clean' });
    }
    return nativeFreeze({ status: 'unavailable' });
  };

  nativeDefineProperty(root, binding.propertyKey, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: nativeFreeze(bridge),
  });
};

export const createTrustedPageProbeBinding = (): TrustedPageProbeBinding =>
  Object.freeze({
    propertyKey: `pdxTrustedPage_${randomUUID().replaceAll('-', '')}`,
    capability: randomUUID(),
  });

export const createTrustedAxeInitSource = (
  axeSource: string = axe.source
): string => `;(function(timerOwner) {
  (function(
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame,
    cancelAnimationFrame,
    requestIdleCallback,
    cancelIdleCallback
  ) {
${axeSource}
  }).call(
    globalThis,
    timerOwner.setTimeout,
    timerOwner.clearTimeout,
    timerOwner.setInterval,
    timerOwner.clearInterval,
    timerOwner.requestAnimationFrame,
    timerOwner.cancelAnimationFrame,
    timerOwner.requestIdleCallback,
    timerOwner.cancelIdleCallback
  );
}).call(globalThis, globalThis.__pwClock?.builtins ?? globalThis);`;

export const installPlaywrightTrustedPageProbe = async (
  page: Page,
  axeSource: string = axe.source
): Promise<TrustedPageProbeBinding> => {
  const binding = createTrustedPageProbeBinding();
  await page.addInitScript({
    content: `${createTrustedAxeInitSource(axeSource)}\n;(${String(initTrustedPageProbe)})(${JSON.stringify(binding)});`,
  });
  return binding;
};
