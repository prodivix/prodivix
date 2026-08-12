import { open, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

import { canonicalJsonText } from '@prodivix/shared/canonical';
import { createProductionAgentEvaluationOwnerAuthorityPortsFromEnvironment } from './productionOwnerAuthorityComposition';
import type { AgentEvaluationOwnerAuthorityShutdownReceipt } from './productionOwnerAuthoritySidecar';
import { createProductionAgentEvaluationOwnerAuthoritySidecarFromEnvironment } from './productionOwnerAuthoritySidecarEnvironment';

const safeStartupDiagnosticPattern =
  /^G4_OWNER_AUTHORITY_(?:CONCRETE_PORTS_UNAVAILABLE|SIDECAR_CONFIGURATION_INVALID|SIDECAR_UNAVAILABLE): [A-Za-z0-9 ./,:()_-]{1,768}$/u;

export const productionAgentEvaluationOwnerAuthorityStartupDiagnostic = (
  caught: unknown
): string =>
  caught instanceof Error && safeStartupDiagnosticPattern.test(caught.message)
    ? caught.message
    : 'G4_OWNER_AUTHORITY_SIDECAR_STARTUP_FAILED_CLOSED';

export const writeProductionAgentEvaluationOwnerAuthorityShutdownReceipt =
  async (
    path: string,
    receipt: AgentEvaluationOwnerAuthorityShutdownReceipt
  ): Promise<void> => {
    let file: Awaited<ReturnType<typeof open>> | undefined;
    let created = false;
    try {
      file = await open(path, 'wx', 0o600);
      created = true;
      await file.chmod(0o600);
      await file.writeFile(canonicalJsonText(receipt), { encoding: 'utf8' });
      await file.sync();
      if (process.platform !== 'win32') {
        const metadata = await file.stat();
        if ((metadata.mode & 0o777) !== 0o600) {
          throw new TypeError(
            'G4 owner authority shutdown receipt permissions drifted.'
          );
        }
      }
      await file.close();
      file = undefined;
      if (process.platform !== 'win32') {
        const directory = await open(dirname(path), 'r');
        try {
          await directory.sync();
        } finally {
          await directory.close();
        }
      }
    } catch (caught) {
      await file?.close().catch(() => undefined);
      if (created) await rm(path, { force: true }).catch(() => undefined);
      throw caught;
    }
  };

export const runProductionAgentEvaluationOwnerAuthoritySidecar = async (
  environment: NodeJS.ProcessEnv = process.env
): Promise<void> => {
  const composition =
    await createProductionAgentEvaluationOwnerAuthoritySidecarFromEnvironment({
      environment,
      createAuthorities:
        createProductionAgentEvaluationOwnerAuthorityPortsFromEnvironment,
    });
  const listener = await composition.sidecar.listen({
    host: composition.host,
    port: composition.port,
  });
  process.stdout.write(
    `${canonicalJsonText(
      Object.freeze({
        ...composition.sidecar.health,
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
        .then((receipt) =>
          writeProductionAgentEvaluationOwnerAuthorityShutdownReceipt(
            composition.shutdownReceiptPath,
            receipt
          )
        )
        .then(resolve, () => {
          process.exitCode = 1;
          resolve();
        });
    };
    process.once('SIGINT', close);
    process.once('SIGTERM', close);
  });
};

const invokedPath = process.argv[1];
const isMain =
  typeof invokedPath === 'string' &&
  pathToFileURL(invokedPath).href === import.meta.url;

if (isMain) {
  runProductionAgentEvaluationOwnerAuthoritySidecar().catch((caught) => {
    process.stderr.write(
      `${productionAgentEvaluationOwnerAuthorityStartupDiagnostic(caught)}\n`
    );
    process.exitCode = 1;
  });
}
