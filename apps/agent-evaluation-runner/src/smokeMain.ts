import { safeRunnerError } from './errors';
import { runAgentEvaluationSmoke } from './smoke';

const writeJsonLine = (target: NodeJS.WriteStream, value: unknown): void => {
  target.write(`${JSON.stringify(value)}\n`);
};

try {
  const report = await runAgentEvaluationSmoke();
  writeJsonLine(process.stdout, report);
  process.exitCode = report.outcome === 'completed' ? 0 : 1;
} catch (caught) {
  writeJsonLine(process.stderr, safeRunnerError(caught).toJSON());
  process.exitCode = 1;
}
