import type { ExecutableProjectSnapshot } from '@prodivix/runtime-core';
import {
  runGoldenG2BrowserMatrix,
  type GoldenG2BrowserMatrixResult,
} from './goldenG2BrowserHarness';
import {
  createGoldenG2ExecutableSnapshot,
  projectGoldenTestSemantics,
  type GoldenTestSemantics,
} from './goldenG2ExecutionFixture';
import {
  runGoldenG2RemoteMatrix,
  type GoldenG2RemoteMatrixResult,
} from './goldenG2RemoteHarness';

export type GoldenG2ExecutionMatrixReport = Readonly<{
  snapshot: ExecutableProjectSnapshot;
  browser: GoldenG2BrowserMatrixResult;
  remote: GoldenG2RemoteMatrixResult;
}>;

export { projectGoldenTestSemantics, type GoldenTestSemantics };

/** Runs the living Golden App through every supported G2 project provider pair. */
export const runGoldenG2ExecutionMatrix =
  async (): Promise<GoldenG2ExecutionMatrixReport> => {
    const snapshot = createGoldenG2ExecutableSnapshot();
    const [browser, remote] = await Promise.all([
      runGoldenG2BrowserMatrix(snapshot),
      runGoldenG2RemoteMatrix(snapshot),
    ]);
    return Object.freeze({ snapshot, browser, remote });
  };
