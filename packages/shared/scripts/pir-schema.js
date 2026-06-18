import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const PIR_SCHEMA_FILE_PATTERN = /^PIR-v(\d+(?:\.\d+)*)\.json$/;
const SPECS_PIR_DIR = resolve(__dirname, '../../../specs/pir');

const parseVersion = (value) => value.split('.').map((part) => Number(part));

const compareVersions = (left, right) => {
  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = left[index] ?? 0;
    const rightPart = right[index] ?? 0;
    if (leftPart !== rightPart) return leftPart - rightPart;
  }
  return 0;
};

export const findLatestPirSchemaPath = () => {
  const candidates = readdirSync(SPECS_PIR_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const match = PIR_SCHEMA_FILE_PATTERN.exec(entry.name);
      if (!match) return null;
      return {
        fileName: entry.name,
        versionParts: parseVersion(match[1]),
      };
    })
    .filter(Boolean)
    .sort((left, right) =>
      compareVersions(right.versionParts, left.versionParts)
    );

  const latest = candidates[0];
  if (!latest) {
    throw new Error(`No PIR schema files found in ${SPECS_PIR_DIR}.`);
  }
  return resolve(SPECS_PIR_DIR, latest.fileName);
};

export const resolvePirSchemaPath = () => {
  const explicitPath = process.env.PIR_SCHEMA_PATH;
  if (!explicitPath) return findLatestPirSchemaPath();
  return resolve(process.cwd(), explicitPath);
};
