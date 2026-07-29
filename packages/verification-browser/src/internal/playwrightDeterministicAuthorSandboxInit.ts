import type { RuntimeReportEvent } from './playwrightDeterministicControlProtocol';

export type PlaywrightAuthorSandboxActivity = {
  activeStreams: number;
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
};

type RuntimeActivity = Extract<
  RuntimeReportEvent,
  { kind: 'activity' }
>['activity'];

/**
 * Installs the author-facing timer, transport, parser, worker, and animation
 * fence before project code executes. This function is serialized into the
 * browser bootstrap, so every runtime dependency must be captured locally.
 */
export const installPlaywrightDeterministicAuthorSandbox = (input: {
  allowedUrls: readonly string[];
  activity: PlaywrightAuthorSandboxActivity;
  reportActivity(activity: RuntimeActivity, policyDirective?: string): void;
}): void => {
  const root = globalThis as typeof globalThis & Record<string, unknown>;
  const activity = input.activity;
  const reportActivity = input.reportActivity;
  const nativeApply = Reflect.apply;
  const nativeDefineProperty = Object.defineProperty;
  const nativeFreeze = Object.freeze;
  const nativeUrl = URL;
  const nativeAddEventListener = EventTarget.prototype.addEventListener;
  const nativeRemoveEventListener = EventTarget.prototype.removeEventListener;
  const nativeNodeAppendChild = Node.prototype.appendChild;
  const nativeNodeInsertBefore = Node.prototype.insertBefore;
  const nativeNodeReplaceChild = Node.prototype.replaceChild;
  const nativeElementGetAttribute = Element.prototype.getAttribute;
  const nativeElementSetAttribute = Element.prototype.setAttribute;
  const nativeElementQuerySelectorAll = Element.prototype.querySelectorAll;
  const nativeDocumentQuerySelectorAll = Document.prototype.querySelectorAll;
  const nativeInnerHtmlSetter = Object.getOwnPropertyDescriptor(
    Element.prototype,
    'innerHTML'
  )?.set;
  const nativeLinkRelDescriptor = Object.getOwnPropertyDescriptor(
    HTMLLinkElement.prototype,
    'rel'
  );
  const nativeLinkHrefDescriptor = Object.getOwnPropertyDescriptor(
    HTMLLinkElement.prototype,
    'href'
  );
  const nativeInsertAdjacentHtml = Element.prototype.insertAdjacentHTML;
  const nativeDocumentWrite = Document.prototype.write;
  const nativeDocumentWriteln = Document.prototype.writeln;
  const NativeMutationObserver = MutationObserver;

  const controlledSetTimeout = globalThis.setTimeout.bind(globalThis);
  const controlledClearTimeout = globalThis.clearTimeout.bind(globalThis);
  const controlledSetInterval = globalThis.setInterval.bind(globalThis);
  const controlledClearInterval = globalThis.clearInterval.bind(globalThis);
  const controlledRequestAnimationFrame =
    globalThis.requestAnimationFrame.bind(globalThis);
  const controlledCancelAnimationFrame =
    globalThis.cancelAnimationFrame.bind(globalThis);
  const controlledRequestIdleCallback =
    globalThis.requestIdleCallback?.bind(globalThis);
  const controlledCancelIdleCallback =
    globalThis.cancelIdleCallback?.bind(globalThis);
  nativeDefineProperty(root, 'setTimeout', {
    configurable: false,
    enumerable: true,
    writable: false,
    value: (
      handler: TimerHandler,
      timeout?: number,
      ...arguments_: unknown[]
    ): number => {
      activity.nativeTimerCreationCount += 1;
      reportActivity('timer-created');
      return controlledSetTimeout(handler, timeout, ...arguments_);
    },
  });
  nativeDefineProperty(root, 'clearTimeout', {
    configurable: false,
    enumerable: true,
    writable: false,
    value: controlledClearTimeout,
  });
  nativeDefineProperty(root, 'setInterval', {
    configurable: false,
    enumerable: true,
    writable: false,
    value: (
      handler: TimerHandler,
      timeout?: number,
      ...arguments_: unknown[]
    ): number => {
      activity.nativeTimerCreationCount += 1;
      reportActivity('timer-created');
      return controlledSetInterval(handler, timeout, ...arguments_);
    },
  });
  nativeDefineProperty(root, 'clearInterval', {
    configurable: false,
    enumerable: true,
    writable: false,
    value: controlledClearInterval,
  });
  nativeDefineProperty(root, 'requestAnimationFrame', {
    configurable: false,
    enumerable: true,
    writable: false,
    value: (callback: FrameRequestCallback): number => {
      activity.authorAnimationFrameCreationCount += 1;
      reportActivity('animation-frame-created');
      return controlledRequestAnimationFrame(callback);
    },
  });
  nativeDefineProperty(root, 'cancelAnimationFrame', {
    configurable: false,
    enumerable: true,
    writable: false,
    value: controlledCancelAnimationFrame,
  });
  if (
    controlledRequestIdleCallback !== undefined &&
    controlledCancelIdleCallback !== undefined
  ) {
    nativeDefineProperty(root, 'requestIdleCallback', {
      configurable: false,
      enumerable: true,
      writable: false,
      value: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions
      ): number => {
        activity.nativeTimerCreationCount += 1;
        reportActivity('timer-created');
        return controlledRequestIdleCallback(callback, options);
      },
    });
    nativeDefineProperty(root, 'cancelIdleCallback', {
      configurable: false,
      enumerable: true,
      writable: false,
      value: controlledCancelIdleCallback,
    });
  }

  const allowed = new Set(input.allowedUrls);
  const resolveAllowed = (source: string): string => {
    const url = new nativeUrl(source, location.href);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !allowed.has(url.href)
    ) {
      activity.deniedRequests += 1;
      reportActivity('request-denied');
      throw new Error(
        `Deterministic browser network denied undeclared URL: ${url.href}`
      );
    }
    return url.href;
  };
  const controlledFetch = globalThis.fetch.bind(globalThis);
  nativeDefineProperty(root, 'fetch', {
    configurable: false,
    enumerable: true,
    writable: false,
    value: async (
      requestInput: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> => {
      activity.authorRequestCreationCount += 1;
      activity.streamCreationCount += 1;
      reportActivity('author-request-created');
      reportActivity('stream-created');
      const source =
        requestInput instanceof Request
          ? requestInput.url
          : String(requestInput);
      const url = resolveAllowed(source);
      const method = (
        init?.method ??
        (requestInput instanceof Request ? requestInput.method : 'GET')
      ).toUpperCase();
      if (method !== 'GET') {
        activity.deniedRequests += 1;
        reportActivity('request-denied');
        throw new Error(
          `Deterministic browser network denied undeclared method: ${method}.`
        );
      }
      activity.activeStreams += 1;
      try {
        const response = await controlledFetch(url, {
          ...init,
          method: 'GET',
          redirect: 'error',
        });
        const body = await response.arrayBuffer();
        return new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } finally {
        activity.activeStreams -= 1;
      }
    },
  });

  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;
  nativeDefineProperty(XMLHttpRequest.prototype, 'open', {
    configurable: false,
    writable: false,
    value: function (
      this: XMLHttpRequest & { __prodivixAllowedUrl?: string },
      method: string,
      url: string | URL,
      async = true,
      username?: string | null,
      password?: string | null
    ): void {
      activity.authorRequestCreationCount += 1;
      activity.streamCreationCount += 1;
      reportActivity('author-request-created');
      reportActivity('stream-created');
      if (
        method.toUpperCase() !== 'GET' ||
        async !== true ||
        (username !== undefined && username !== null) ||
        (password !== undefined && password !== null)
      ) {
        activity.deniedRequests += 1;
        reportActivity('request-denied');
        throw new Error(
          'Deterministic browser XMLHttpRequest requires an asynchronous credential-free GET.'
        );
      }
      this.__prodivixAllowedUrl = resolveAllowed(String(url));
      nativeOpen.call(
        this,
        method,
        this.__prodivixAllowedUrl,
        async,
        username,
        password
      );
    },
  });
  nativeDefineProperty(XMLHttpRequest.prototype, 'send', {
    configurable: false,
    writable: false,
    value: function (
      this: XMLHttpRequest & { __prodivixAllowedUrl?: string },
      body?: Document | XMLHttpRequestBodyInit | null
    ): void {
      if (
        this.__prodivixAllowedUrl === undefined ||
        (body !== undefined && body !== null)
      ) {
        activity.deniedRequests += 1;
        reportActivity('request-denied');
        throw new Error(
          'Deterministic browser XMLHttpRequest body or lifecycle is undeclared.'
        );
      }
      activity.activeStreams += 1;
      const onLoadEnd = (): void => {
        activity.activeStreams -= 1;
      };
      nativeApply(nativeAddEventListener, this, [
        'loadend',
        onLoadEnd,
        { once: true },
      ]);
      try {
        nativeSend.call(this, body);
      } catch (error) {
        nativeApply(nativeRemoveEventListener, this, ['loadend', onLoadEnd]);
        activity.activeStreams -= 1;
        throw error;
      }
    },
  });

  const denyStream = (kind: string): never => {
    activity.authorRequestCreationCount += 1;
    activity.streamCreationCount += 1;
    activity.deniedRequests += 1;
    reportActivity('author-request-created');
    reportActivity('stream-created');
    reportActivity('request-denied');
    throw new Error(`Deterministic browser ${kind} transport is undeclared.`);
  };
  nativeDefineProperty(root, 'WebSocket', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: class {
      constructor() {
        denyStream('WebSocket');
      }
    },
  });
  nativeDefineProperty(root, 'EventSource', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: class {
      constructor() {
        denyStream('EventSource');
      }
    },
  });
  nativeDefineProperty(navigator, 'sendBeacon', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: (): boolean => denyStream('sendBeacon'),
  });
  for (const capability of [
    'RTCPeerConnection',
    'webkitRTCPeerConnection',
    'RTCDataChannel',
    'WebTransport',
  ] as const) {
    nativeDefineProperty(root, capability, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: class {
        constructor() {
          denyStream(capability);
        }
      },
    });
  }
  if (
    typeof ServiceWorkerContainer !== 'undefined' &&
    typeof ServiceWorkerContainer.prototype.register === 'function'
  ) {
    nativeDefineProperty(ServiceWorkerContainer.prototype, 'register', {
      configurable: false,
      enumerable: false,
      writable: false,
      value: (): never => denyStream('ServiceWorker registration'),
    });
  }

  const speculativeRelTokens = nativeFreeze([
    'dns-prefetch',
    'preconnect',
    'prefetch',
    'prerender',
  ]);
  const unsafeRel = (value: string): boolean =>
    value
      .toLowerCase()
      .split(/\s+/u)
      .some((token) => speculativeRelTokens.includes(token));
  const unsafeParserHtml =
    /<(?:iframe|frame|object|embed)\b|<meta\b[^>]*\bhttp-equiv\s*=\s*["']?\s*refresh\b|<script\b[^>]*\btype\s*=\s*["']?\s*speculationrules\b|<link\b[^>]*\brel\s*=\s*["'][^"']*\b(?:dns-prefetch|preconnect|prefetch|prerender)\b/iu;
  const recordParserEgressViolation = (policyDirective?: string): void => {
    activity.authorRequestCreationCount += 1;
    activity.streamCreationCount += 1;
    activity.deniedRequests += 1;
    reportActivity('author-request-created');
    reportActivity('stream-created');
    reportActivity(
      'request-denied',
      policyDirective !== undefined &&
        /^[a-z][a-z0-9-]{0,63}(?::[a-z][a-z0-9-]{0,31})?$/u.test(
          policyDirective
        )
        ? policyDirective
        : policyDirective === undefined
          ? undefined
          : 'unknown'
    );
  };
  nativeApply(nativeAddEventListener, root, [
    'securitypolicyviolation',
    (event: SecurityPolicyViolationEvent) => {
      const blockedKind =
        event.blockedURI === 'inline'
          ? 'inline'
          : event.blockedURI === 'eval'
            ? 'eval'
            : event.blockedURI === 'wasm-eval'
              ? 'wasm-eval'
              : event.blockedURI === ''
                ? 'empty'
                : (() => {
                    try {
                      return new nativeUrl(event.blockedURI, location.href)
                        .origin === location.origin
                        ? 'same-origin'
                        : 'cross-origin';
                    } catch {
                      return 'opaque';
                    }
                  })();
      recordParserEgressViolation(`${event.effectiveDirective}:${blockedKind}`);
    },
    true,
  ]);
  const denyParserEgress = (kind: string): never => {
    recordParserEgressViolation();
    throw new Error(
      `Deterministic browser ${kind} parser egress is undeclared.`
    );
  };
  const elementHasUnsafeParserEgress = (element: Element): boolean => {
    const tagName = element.tagName.toLowerCase();
    if (
      tagName === 'iframe' ||
      tagName === 'frame' ||
      tagName === 'object' ||
      tagName === 'embed'
    ) {
      return true;
    }
    if (
      tagName === 'meta' &&
      (
        nativeApply(nativeElementGetAttribute, element, ['http-equiv']) as
          string | null
      )
        ?.trim()
        .toLowerCase() === 'refresh'
    ) {
      return true;
    }
    if (
      tagName === 'script' &&
      (
        nativeApply(nativeElementGetAttribute, element, ['type']) as
          string | null
      )
        ?.trim()
        .toLowerCase() === 'speculationrules'
    ) {
      return true;
    }
    return (
      tagName === 'link' &&
      unsafeRel(
        (nativeApply(nativeElementGetAttribute, element, ['rel']) as
          string | null) ?? ''
      )
    );
  };
  const assertSafeParserNode = (node: Node): void => {
    if (node instanceof Element) {
      if (elementHasUnsafeParserEgress(node)) {
        denyParserEgress(node.tagName.toLowerCase());
      }
      const descendants = nativeApply(nativeElementQuerySelectorAll, node, [
        'iframe,frame,object,embed,meta[http-equiv],script[type],link[rel]',
      ]) as NodeListOf<Element>;
      if ([...descendants].some(elementHasUnsafeParserEgress)) {
        denyParserEgress('nested element');
      }
      return;
    }
    for (const child of [...node.childNodes]) {
      assertSafeParserNode(child);
    }
  };
  const assertSafeParserHtml = (html: string): void => {
    if (unsafeParserHtml.test(html)) {
      denyParserEgress('HTML');
    }
  };
  nativeDefineProperty(Node.prototype, 'appendChild', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: function <T extends Node>(this: Node, node: T): T {
      assertSafeParserNode(node);
      return nativeApply(nativeNodeAppendChild, this, [node]) as T;
    },
  });
  nativeDefineProperty(Node.prototype, 'insertBefore', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: function <T extends Node>(
      this: Node,
      node: T,
      child: Node | null
    ): T {
      assertSafeParserNode(node);
      return nativeApply(nativeNodeInsertBefore, this, [node, child]) as T;
    },
  });
  nativeDefineProperty(Node.prototype, 'replaceChild', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: function <T extends Node>(this: Node, node: Node, child: T): T {
      assertSafeParserNode(node);
      return nativeApply(nativeNodeReplaceChild, this, [node, child]) as T;
    },
  });
  nativeDefineProperty(Element.prototype, 'setAttribute', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: function (
      this: Element,
      qualifiedName: string,
      value: string
    ): void {
      const name = qualifiedName.toLowerCase();
      if (
        (this instanceof HTMLLinkElement &&
          name === 'rel' &&
          unsafeRel(value)) ||
        (this instanceof HTMLMetaElement &&
          name === 'http-equiv' &&
          value.trim().toLowerCase() === 'refresh') ||
        (this instanceof HTMLScriptElement &&
          name === 'type' &&
          value.trim().toLowerCase() === 'speculationrules')
      ) {
        denyParserEgress(`${this.tagName.toLowerCase()} attribute`);
      }
      nativeApply(nativeElementSetAttribute, this, [qualifiedName, value]);
    },
  });
  if (
    nativeInnerHtmlSetter !== undefined &&
    Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')
      ?.configurable
  ) {
    const nativeInnerHtmlGetter = Object.getOwnPropertyDescriptor(
      Element.prototype,
      'innerHTML'
    )?.get;
    nativeDefineProperty(Element.prototype, 'innerHTML', {
      configurable: false,
      enumerable: false,
      ...(nativeInnerHtmlGetter === undefined
        ? {}
        : { get: nativeInnerHtmlGetter }),
      set(this: Element, value: string) {
        assertSafeParserHtml(String(value));
        nativeApply(nativeInnerHtmlSetter, this, [value]);
      },
    });
  }
  nativeDefineProperty(Element.prototype, 'insertAdjacentHTML', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: function (
      this: Element,
      position: InsertPosition,
      text: string
    ): void {
      assertSafeParserHtml(String(text));
      nativeApply(nativeInsertAdjacentHtml, this, [position, text]);
    },
  });
  nativeDefineProperty(Document.prototype, 'write', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: function (this: Document, ...text: string[]): void {
      text.forEach((value) => assertSafeParserHtml(String(value)));
      nativeApply(nativeDocumentWrite, this, text);
    },
  });
  nativeDefineProperty(Document.prototype, 'writeln', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: function (this: Document, ...text: string[]): void {
      text.forEach((value) => assertSafeParserHtml(String(value)));
      nativeApply(nativeDocumentWriteln, this, text);
    },
  });
  const wrapLinkStringProperty = (
    property: 'rel' | 'href',
    descriptor: PropertyDescriptor | undefined
  ): void => {
    if (
      descriptor?.get === undefined ||
      descriptor.set === undefined ||
      !descriptor.configurable
    ) {
      throw new Error(
        `Deterministic browser cannot protect HTMLLinkElement.${property}.`
      );
    }
    nativeDefineProperty(HTMLLinkElement.prototype, property, {
      configurable: false,
      enumerable: descriptor.enumerable ?? false,
      get: descriptor.get,
      set(this: HTMLLinkElement, value: string) {
        if (
          (property === 'rel' && unsafeRel(String(value))) ||
          (property === 'href' &&
            unsafeRel(
              (nativeApply(nativeElementGetAttribute, this, ['rel']) as
                string | null) ?? ''
            ))
        ) {
          denyParserEgress(`link ${property}`);
        }
        nativeApply(descriptor.set!, this, [value]);
      },
    });
  };
  wrapLinkStringProperty('rel', nativeLinkRelDescriptor);
  wrapLinkStringProperty('href', nativeLinkHrefDescriptor);
  const parserObserver = new NativeMutationObserver(() => {
    const elements = nativeApply(nativeDocumentQuerySelectorAll, document, [
      'iframe,frame,object,embed,meta[http-equiv],script[type],link[rel]',
    ]) as NodeListOf<Element>;
    if ([...elements].some(elementHasUnsafeParserEgress)) {
      recordParserEgressViolation();
    }
  });
  parserObserver.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['rel', 'href', 'src', 'http-equiv', 'content', 'type'],
  });

  const denyWorker = (kind: string): never => {
    activity.workerCreationCount += 1;
    activity.deniedWorkerCreations += 1;
    reportActivity('worker-created');
    reportActivity('worker-denied');
    throw new Error(
      `Deterministic browser ${kind} is not declared by this Plan.`
    );
  };
  nativeDefineProperty(root, 'Worker', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: class {
      constructor() {
        denyWorker('Worker');
      }
    },
  });
  nativeDefineProperty(root, 'SharedWorker', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: class {
      constructor() {
        denyWorker('SharedWorker');
      }
    },
  });
  nativeDefineProperty(URL, 'createObjectURL', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: (object: Blob | MediaSource): never => {
      activity.deniedRequests += 1;
      reportActivity('request-denied');
      throw new Error(
        `Deterministic browser blob URL is undeclared: ${object.constructor.name}.`
      );
    },
  });

  const denyAuthoredAnimation = (): never => {
    activity.authoredAnimationCreationCount += 1;
    reportActivity('animation-created');
    throw new Error(
      'Authored WAAPI animation is outside the deterministic animation policy.'
    );
  };
  nativeDefineProperty(Element.prototype, 'animate', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: (): Animation => denyAuthoredAnimation(),
  });
  nativeDefineProperty(root, 'Animation', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: class {
      constructor() {
        denyAuthoredAnimation();
      }
    },
  });
  nativeDefineProperty(root, 'KeyframeEffect', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: class {
      constructor() {
        denyAuthoredAnimation();
      }
    },
  });
  nativeApply(nativeAddEventListener, root, [
    'animationstart',
    () => {
      activity.authoredAnimationCreationCount += 1;
      reportActivity('animation-created');
    },
    true,
  ]);
  nativeApply(nativeAddEventListener, root, [
    'transitionstart',
    () => {
      activity.authoredAnimationCreationCount += 1;
      reportActivity('animation-created');
    },
    true,
  ]);
};
