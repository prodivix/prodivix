import { RemoteExecutionRegionalRecoveryOperatorError } from '@prodivix/runtime-remote';
import { runRemoteRegionalRecoveryOperatorJob } from './regionalRecoveryOperatorJob';

try {
  await runRemoteRegionalRecoveryOperatorJob();
} catch (error) {
  const message =
    error instanceof RemoteExecutionRegionalRecoveryOperatorError
      ? `Remote regional recovery failed closed: ${error.code}.`
      : error instanceof TypeError
        ? error.message
        : 'Remote regional recovery operator job failed.';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
