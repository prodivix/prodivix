import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const SPECS_PIR_DIR = resolve(__dirname, '../../../specs/pir');
const CURRENT_SCHEMA_PATH = resolve(SPECS_PIR_DIR, 'PIR-current.json');
const CURRENT_VERSION_MANIFEST_PATH = resolve(
  SPECS_PIR_DIR,
  'PIR-current.version.json'
);
const PIR_VERSION_PATTERN = /^\d+(?:\.\d+)*$/;

const readJson = (path, label) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to read ${label} at ${path}: ${error.message}`);
  }
};

const resolveLocalJsonPointer = (document, pointer) => {
  if (!pointer.startsWith('#/')) return undefined;
  return pointer
    .slice(2)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce(
      (value, segment) =>
        value && typeof value === 'object' ? value[segment] : undefined,
      document
    );
};

export const getPirSchemaVersion = (schema) => {
  let rootSchema = schema;
  const visitedReferences = new Set();
  while (
    rootSchema &&
    typeof rootSchema === 'object' &&
    typeof rootSchema.$ref === 'string' &&
    rootSchema.$ref.startsWith('#/')
  ) {
    if (visitedReferences.has(rootSchema.$ref)) {
      throw new Error(`PIR schema root reference cycle at ${rootSchema.$ref}.`);
    }
    visitedReferences.add(rootSchema.$ref);
    rootSchema = resolveLocalJsonPointer(schema, rootSchema.$ref);
  }
  const version = rootSchema?.properties?.version?.const;
  if (typeof version !== 'string' || !version.trim()) {
    throw new Error('PIR schema must define a string root version const.');
  }
  return version;
};

const readSchemaVersion = (schemaPath) => {
  const schema = readJson(schemaPath, 'PIR schema');
  try {
    return getPirSchemaVersion(schema);
  } catch (error) {
    throw new Error(`Invalid PIR schema at ${schemaPath}: ${error.message}`);
  }
};

const readActivatedPirVersion = () => {
  const manifest = readJson(
    CURRENT_VERSION_MANIFEST_PATH,
    'PIR current activation manifest'
  );
  const version = manifest?.version;
  if (
    typeof version !== 'string' ||
    version !== version.trim() ||
    !PIR_VERSION_PATTERN.test(version)
  ) {
    throw new Error(
      `PIR current activation manifest at ${CURRENT_VERSION_MANIFEST_PATH} must define a canonical numeric version.`
    );
  }
  return version;
};

const assertSchemaVersion = (schemaPath, expectedVersion) => {
  const schemaVersion = readSchemaVersion(schemaPath);
  if (expectedVersion !== undefined && schemaVersion !== expectedVersion) {
    throw new Error(
      `PIR schema version ${JSON.stringify(schemaVersion)} at ${schemaPath} does not match activated current ${JSON.stringify(expectedVersion)}.`
    );
  }
  return schemaVersion;
};

/** Resolves the immutable snapshot selected by the activation manifest. */
export const resolveActivatedPirSnapshot = () => {
  const version = readActivatedPirVersion();
  const schemaPath = resolve(SPECS_PIR_DIR, `PIR-v${version}.json`);
  assertSchemaVersion(schemaPath, version);
  return Object.freeze({ version, schemaPath });
};

/** Resolves the only active PIR wire schema and verifies its manifest version. */
export const resolveCurrentPirSchema = () => {
  const version = readActivatedPirVersion();
  assertSchemaVersion(CURRENT_SCHEMA_PATH, version);
  return Object.freeze({ version, schemaPath: CURRENT_SCHEMA_PATH });
};

/**
 * Resolves a PIR schema for standalone validation. An explicit environment
 * override is intentionally limited to staged tooling and never used by
 * current schema/type generation.
 */
export const resolvePirSchemaPath = () => {
  const explicitPath = process.env.PIR_SCHEMA_PATH?.trim();
  if (!explicitPath) return resolveCurrentPirSchema().schemaPath;
  const schemaPath = resolve(process.cwd(), explicitPath);
  assertSchemaVersion(schemaPath);
  return schemaPath;
};
