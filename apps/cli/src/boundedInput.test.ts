import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readBoundedCliInput } from './boundedInput.js';

test('CLI input preserves exact Unicode bytes at the declared limit', () => {
  const directory = mkdtempSync(join(tmpdir(), 'prodivix-bounded-input-'));
  try {
    const file = join(directory, 'input.json');
    const bytes = Buffer.from('{"value":"中文😀"}');
    writeFileSync(file, bytes);
    assert.deepEqual(readBoundedCliInput(file, bytes.length), bytes);
    assert.throws(
      () => readBoundedCliInput(file, bytes.length - 1),
      /byte limit/u
    );
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test('CLI input refuses oversized sparse files and directories before allocating their content', () => {
  const directory = mkdtempSync(join(tmpdir(), 'prodivix-bounded-input-'));
  try {
    const file = join(directory, 'input.json');
    writeFileSync(file, '{}');
    truncateSync(file, 67_108_865);
    assert.throws(() => readBoundedCliInput(file, 8_388_608), /byte limit/u);
    assert.throws(() => readBoundedCliInput(directory, 8_388_608));
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test('CLI artifact input supports exact empty bytes while JSON rejects empty input', () => {
  const directory = mkdtempSync(join(tmpdir(), 'prodivix-bounded-input-'));
  try {
    const file = join(directory, 'artifact');
    writeFileSync(file, '');
    assert.throws(() => readBoundedCliInput(file, 8_388_608), /empty/u);
    assert.deepEqual(
      readBoundedCliInput(file, 0, { allowEmpty: true }),
      Buffer.alloc(0)
    );
    writeFileSync(file, 'x');
    assert.throws(
      () => readBoundedCliInput(file, 0, { allowEmpty: true }),
      /byte limit/u
    );
  } finally {
    rmSync(directory, { recursive: true });
  }
});
