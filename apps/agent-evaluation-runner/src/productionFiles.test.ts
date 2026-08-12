import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { afterEach, describe, expect, it } from 'vitest';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import { createNodeAgentEvaluationCoordinatorFilePort } from './productionFiles';

const directories: string[] = [];

const temporaryDirectory = async (): Promise<string> => {
  const directory = resolve(
    await mkdtemp(join(tmpdir(), 'prodivix-g4-files-'))
  );
  directories.push(directory);
  return directory;
};

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { force: true, recursive: true });
  }
});

describe('node agent evaluation coordinator file port', () => {
  it('reads bounded strict UTF-8 JSON while preserving ordinary formatting freedom', async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, 'input.json');
    await writeFile(path, '{\n  "message": "你好",\n  "count": 2\n}', 'utf8');
    const files = createNodeAgentEvaluationCoordinatorFilePort({
      maximumBytes: 128,
    });
    await expect(files.readJson(path)).resolves.toEqual({
      message: '你好',
      count: 2,
    });
  });

  it('admits exact canonical JSON bytes and rejects formatting drift', async () => {
    const directory = await temporaryDirectory();
    const canonicalPath = join(directory, 'canonical.json');
    const formattedPath = join(directory, 'formatted.json');
    const value = { z: 2, a: 'value' };
    await writeFile(canonicalPath, canonicalJsonText(value), 'utf8');
    await writeFile(formattedPath, '{\n  "a": "value",\n  "z": 2\n}\n', 'utf8');
    const files = createNodeAgentEvaluationCoordinatorFilePort();
    await expect(files.readCanonicalJson?.(canonicalPath)).resolves.toEqual(
      value
    );
    await expect(
      files.readCanonicalJson?.(formattedPath)
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
    });
  });

  it.each([
    ['duplicate', '{"value":1,"value":2}'],
    ['escaped duplicate', '{"value":1,"\\u0076alue":2}'],
    ['unsafe key', '{"__proto__":{"polluted":true}}'],
  ])('rejects %s without surfacing file content', async (_name, source) => {
    const directory = await temporaryDirectory();
    const path = join(directory, 'invalid.json');
    await writeFile(path, source, 'utf8');
    const files = createNodeAgentEvaluationCoordinatorFilePort({
      maximumBytes: 128,
    });
    let serialized = '';
    try {
      await files.readJson(path);
    } catch (caught) {
      serialized = JSON.stringify(caught);
    }
    expect(serialized).toContain(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
    );
    expect(serialized).not.toContain(path);
    expect(serialized).not.toContain(source);
  });

  it('rejects BOM, invalid UTF-8, and oversized input', async () => {
    const directory = await temporaryDirectory();
    const files = createNodeAgentEvaluationCoordinatorFilePort({
      maximumBytes: 16,
    });
    const bom = join(directory, 'bom.json');
    const invalidUtf8 = join(directory, 'invalid-utf8.json');
    const oversized = join(directory, 'oversized.json');
    await writeFile(bom, Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d]));
    await writeFile(invalidUtf8, Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x7d]));
    await writeFile(oversized, JSON.stringify({ value: 'x'.repeat(32) }));
    await expect(files.readJson(bom)).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
    });
    await expect(files.readJson(invalidUtf8)).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
    });
    await expect(files.readJson(oversized)).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
    });
  });

  it('atomically replaces a target with exact canonical UTF-8 bytes', async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, 'output.json');
    await writeFile(path, 'old', 'utf8');
    const value = { z: '末尾', a: [2, 1] };
    const files = createNodeAgentEvaluationCoordinatorFilePort();
    await files.writeCanonicalJson(path, value);
    const bytes = await readFile(path);
    expect(bytes.equals(Buffer.from(canonicalJsonText(value), 'utf8'))).toBe(
      true
    );
    expect(bytes.at(-1)).not.toBe(0x0a);
    expect(await readdir(directory)).toEqual(['output.json']);
  });

  it('uses exclusive creation and preserves an existing artifact', async () => {
    const directory = await temporaryDirectory();
    const path = join(directory, 'evidence.json');
    const files = createNodeAgentEvaluationCoordinatorFilePort();
    await files.createCanonicalJson(path, { first: true });
    await expect(
      files.createCanonicalJson(path, { replacement: true })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed,
    });
    expect(await readFile(path, 'utf8')).toBe('{"first":true}');
    expect(await readdir(directory)).toEqual(['evidence.json']);
  });

  it('rejects non-canonical, relative, or directory-escaping paths', async () => {
    const directory = await temporaryDirectory();
    const files = createNodeAgentEvaluationCoordinatorFilePort();
    await expect(files.readJson('relative.json')).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
    });
    await expect(
      files.writeCanonicalJson(`${directory}${sep}..${sep}escape.json`, {})
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed,
    });
  });
});
