import { pathToFileURL } from 'node:url';

import { canonicalJsonText } from '@prodivix/shared/canonical';
import { createProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarFromEnvironment } from './productionHostedRetrievalRuntimeResourceLifecycleComposition';

export const runProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecar =
  async (environment: NodeJS.ProcessEnv = process.env): Promise<void> => {
    const composition =
      await createProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarFromEnvironment(
        { environment }
      );
    const listener = await composition.sidecar.listen();
    process.stdout.write(
      `${canonicalJsonText(
        Object.freeze({
          format:
            'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-sidecar-started',
          version: 1,
          status: 'listening',
          role: composition.role,
          namespaceId: composition.scope.namespaceId,
          lifecycleOwnerInstanceId: composition.lifecycleOwnerInstanceId,
          baseUrl: listener.baseUrl,
        })
      )}\n`
    );
    await new Promise<void>((resolve) => {
      let closing = false;
      const close = () => {
        if (closing) return;
        closing = true;
        void listener
          .close()
          .then(() => composition.provider.close())
          .then(
            () => resolve(),
            () => {
              process.exitCode = 1;
              resolve();
            }
          );
      };
      process.once('SIGINT', close);
      process.once('SIGTERM', close);
    });
  };

const invokedPath = process.argv[1];
if (
  typeof invokedPath === 'string' &&
  pathToFileURL(invokedPath).href === import.meta.url
) {
  runProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecar().catch(
    () => {
      process.stderr.write(
        'G4_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_STARTUP_FAILED_CLOSED\n'
      );
      process.exitCode = 1;
    }
  );
}
