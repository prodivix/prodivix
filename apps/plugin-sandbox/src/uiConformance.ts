type ConformanceResult = Readonly<{
  parentDomBlocked: boolean;
  topNavigationBlocked: boolean;
  networkBlocked: boolean;
  storageBlocked: boolean;
  nestedWorkerBlocked: boolean;
  popupBlocked: boolean;
  permissionBlocked: boolean;
  formAndDownloadAttempted: boolean;
}>;

const fragment = new URLSearchParams(location.hash.slice(1));
const nonce = fragment.get('nonce');
const reportProgress = (stage: string) =>
  window.parent.postMessage(
    { kind: 'prodivix-ui-conformance-progress', nonce, stage },
    '*'
  );

const promiseRejected = async (operation: () => Promise<unknown>) => {
  try {
    await operation();
    return false;
  } catch {
    return true;
  }
};

const promiseRejectedOrUnavailable = async (
  operation: () => Promise<unknown>,
  timeoutMs = 750
) => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const completed = await Promise.race([
      operation()
        .then(() => false)
        .catch(() => true),
      new Promise<true>((resolve) => {
        timeout = setTimeout(() => resolve(true), timeoutMs);
      }),
    ]);
    return completed;
  } catch {
    return true;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
};

const parentDomBlocked = (() => {
  try {
    void window.parent.document.body;
    return false;
  } catch {
    return true;
  }
})();

const topNavigationBlocked = (() => {
  try {
    window.top!.location.hash = '#plugin-sandbox-navigation-escape';
    return false;
  } catch {
    return true;
  }
})();
reportProgress('dom-and-navigation');

const fetchBlocked = await promiseRejected(() => fetch('/network-probe'));
const websocketBlocked = await new Promise<boolean>((resolve) => {
  try {
    const socket = new WebSocket('wss://example.com/');
    const timeout = setTimeout(() => {
      socket.close();
      resolve(false);
    }, 500);
    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timeout);
        socket.close();
        resolve(false);
      },
      { once: true }
    );
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timeout);
        socket.close();
        resolve(true);
      },
      { once: true }
    );
  } catch {
    resolve(true);
  }
});
const eventSourceBlocked = await new Promise<boolean>((resolve) => {
  try {
    const source = new EventSource('https://example.com/events');
    const timeout = setTimeout(() => {
      source.close();
      resolve(false);
    }, 500);
    source.addEventListener(
      'open',
      () => {
        clearTimeout(timeout);
        source.close();
        resolve(false);
      },
      { once: true }
    );
    source.addEventListener(
      'error',
      () => {
        clearTimeout(timeout);
        source.close();
        resolve(true);
      },
      { once: true }
    );
  } catch {
    resolve(true);
  }
});
reportProgress('network');

const localStorageBlocked = (() => {
  try {
    localStorage.setItem('prodivix-sandbox-probe', '1');
    return false;
  } catch {
    return true;
  }
})();
const sessionStorageBlocked = (() => {
  try {
    sessionStorage.setItem('prodivix-sandbox-probe', '1');
    return false;
  } catch {
    return true;
  }
})();
const indexedDbBlocked = await new Promise<boolean>((resolve) => {
  let settled = false;
  const finish = (blocked: boolean) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    resolve(blocked);
  };
  const timeout = setTimeout(() => finish(true), 750);
  try {
    const request = indexedDB.open('prodivix-sandbox-probe');
    request.addEventListener(
      'success',
      () => {
        request.result.close();
        finish(false);
      },
      { once: true }
    );
    request.addEventListener('error', () => finish(true), { once: true });
    request.addEventListener('blocked', () => finish(true), { once: true });
  } catch {
    finish(true);
  }
});
const cacheStorageBlocked = await promiseRejectedOrUnavailable(() =>
  caches.open('prodivix-sandbox-probe')
);
reportProgress('storage');

const nestedWorkerBlocked = await new Promise<boolean>((resolve) => {
  const source = URL.createObjectURL(
    new Blob(['postMessage("started");'], { type: 'text/javascript' })
  );
  try {
    const worker = new Worker(source);
    const finish = (blocked: boolean) => {
      worker.terminate();
      URL.revokeObjectURL(source);
      resolve(blocked);
    };
    const timeout = setTimeout(() => finish(false), 500);
    worker.addEventListener(
      'message',
      () => {
        clearTimeout(timeout);
        finish(false);
      },
      { once: true }
    );
    worker.addEventListener(
      'error',
      () => {
        clearTimeout(timeout);
        finish(true);
      },
      { once: true }
    );
  } catch {
    URL.revokeObjectURL(source);
    resolve(true);
  }
});
reportProgress('nested-worker');

const popupBlocked = (() => {
  try {
    const popup = window.open('about:blank', '_blank');
    popup?.close();
    return popup === null;
  } catch {
    return true;
  }
})();
reportProgress('popup');

const permissionBlocked = await new Promise<boolean>((resolve) => {
  if (!navigator.geolocation) {
    resolve(true);
    return;
  }
  const timeout = setTimeout(() => resolve(false), 500);
  navigator.geolocation.getCurrentPosition(
    () => {
      clearTimeout(timeout);
      resolve(false);
    },
    () => {
      clearTimeout(timeout);
      resolve(true);
    },
    { timeout: 250 }
  );
});
reportProgress('permission');

// Keep potentially document-replacing probes last so a blocked form or
// download cannot prevent the bounded async authority probes from completing.
const form = document.createElement('form');
form.action = 'https://example.com/plugin-sandbox-form-escape';
form.method = 'post';
form.target = '_top';
document.body.append(form);
try {
  form.submit();
} catch {
  // Sandbox and CSP are expected to reject form submission.
}
const download = document.createElement('a');
download.href = 'data:text/plain,prodivix-sandbox-download-probe';
download.download = 'sandbox-probe.txt';
document.body.append(download);
try {
  download.click();
} catch {
  // The missing allow-downloads token is expected to reject the action.
}
reportProgress('form-and-download');

const result: ConformanceResult = Object.freeze({
  parentDomBlocked,
  topNavigationBlocked,
  networkBlocked: fetchBlocked && websocketBlocked && eventSourceBlocked,
  storageBlocked:
    localStorageBlocked &&
    sessionStorageBlocked &&
    indexedDbBlocked &&
    cacheStorageBlocked,
  nestedWorkerBlocked,
  popupBlocked,
  permissionBlocked,
  formAndDownloadAttempted: true,
});

window.parent.postMessage(
  {
    kind: 'prodivix-ui-conformance-result',
    nonce,
    result,
  },
  '*'
);
