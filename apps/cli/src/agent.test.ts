import assert from 'node:assert/strict';
import test from 'node:test';
import type { Option } from 'commander';
import { AGENT_COMMAND_NAMES, createAgentCommand } from './commands/agent.js';

test('Agent CLI exposes the complete explicit V7 product loop', () => {
  const command = createAgentCommand();
  assert.deepEqual(
    command.commands.map((child) => child.name()),
    [...AGENT_COMMAND_NAMES]
  );
  assert.doesNotMatch(command.helpInformation(), /skip[- ]approval/iu);
  for (const child of command.commands) {
    assert.doesNotMatch(child.helpInformation(), /skip[- ]approval/iu);
  }
});

test('approval and rejection remain separate human commands', () => {
  const command = createAgentCommand();
  const approve = command.commands.find((child) => child.name() === 'approve');
  const reject = command.commands.find((child) => child.name() === 'reject');
  assert.ok(approve);
  assert.ok(reject);
  const rollback = approve.options.find(({ long }) => long === '--rollback');
  assert.ok(
    rollback?.mandatory,
    'approve must require explicit rollback choice'
  );
  assert.equal(
    reject.options.some(({ long }) => long === '--rollback'),
    false,
    'rejection cannot smuggle rollback authority'
  );
});

test('approval command has no bypass option in its parser contract', () => {
  const command = createAgentCommand();
  const approve = command.commands.find((child) => child.name() === 'approve');
  assert.ok(approve);
  assert.equal(
    approve.options.some(({ long }) => long === '--skip-approval'),
    false
  );
});

test('offline inspect does not require remote authority options', () => {
  const command = createAgentCommand();
  const inspect = command.commands.find((child) => child.name() === 'inspect');
  assert.ok(inspect);
  for (const optionName of [
    '--base-url',
    '--project',
    '--workspace',
    '--run',
  ]) {
    const matchingOption: Option | undefined = inspect.options.find(
      (candidate) => candidate.long === optionName
    );
    assert.ok(matchingOption);
    assert.equal(matchingOption.mandatory, false);
  }
});
