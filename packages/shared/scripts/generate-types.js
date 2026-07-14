import { compile } from 'json-schema-to-typescript';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPirSchemaVersion, resolveCurrentPirSchema } from './pir-schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_PATH = path.resolve(
  __dirname,
  '../../pir/src/codec/pirWire.generated.ts'
);
const WIRE_TYPE_PREFIX = 'PIRWire';

const toWireTypeName = (definitionName) => {
  const unqualifiedName = /^pir[A-Z]/.test(definitionName)
    ? definitionName.slice(3)
    : definitionName;
  return `${WIRE_TYPE_PREFIX}${unqualifiedName.charAt(0).toUpperCase()}${unqualifiedName.slice(1)}`;
};

const createWireDefinitions = (definitions = {}) => {
  const typeNames = new Set();
  return Object.fromEntries(
    Object.entries(definitions).map(([definitionName, definition]) => {
      if (
        !definition ||
        typeof definition !== 'object' ||
        Array.isArray(definition)
      ) {
        return [definitionName, definition];
      }
      const title = toWireTypeName(definitionName);
      if (typeNames.has(title)) {
        throw new Error(`PIR wire type name collision: ${title}`);
      }
      typeNames.add(title);
      return [definitionName, { ...definition, title }];
    })
  );
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

const readSchema = (schemaPath) => {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const rootSchema =
    typeof schema.$ref === 'string'
      ? resolveLocalJsonPointer(schema, schema.$ref)
      : schema;
  if (!rootSchema || typeof rootSchema !== 'object') {
    throw new Error(
      `PIR schema has an unresolved root reference: ${schema.$ref}`
    );
  }

  const {
    $ref: _rootReference,
    title: _schemaTitle,
    ...schemaMetadata
  } = schema;
  return {
    ...schemaMetadata,
    ...rootSchema,
    title: `${WIRE_TYPE_PREFIX}Document`,
    $defs: createWireDefinitions(schema.$defs),
  };
};

const { schemaPath, version: activatedVersion } = resolveCurrentPirSchema();
const schema = readSchema(schemaPath);
const pirVersion = getPirSchemaVersion(schema);
if (pirVersion !== activatedVersion) {
  throw new Error(
    `Activated PIR version ${JSON.stringify(activatedVersion)} does not match schema version ${JSON.stringify(pirVersion)}.`
  );
}
const sourceLabel = 'specs/pir/PIR-current.json';

console.log('Generating PIR TypeScript types from schema...');
console.log(`   Schema: ${schemaPath}`);
console.log(`   Output: ${OUTPUT_PATH}`);

compile(schema, `${WIRE_TYPE_PREFIX}Document`, {
  bannerComment: `/* eslint-disable */\n/**\n * Generated wire contract from ${sourceLabel.replaceAll('\\', '/')}\n * Owned by the @prodivix/pir codec boundary; domain consumers must decode this shape.\n * DO NOT EDIT - Run \`pnpm run pir:sync-wire\` to regenerate.\n */`,
  format: true,
  ignoreMinAndMaxItems: true,
  style: {
    singleQuote: true,
    semi: true,
    tabWidth: 2,
  },
})
  .then((ts) => {
    const output = `${ts}\nexport const CURRENT_PIR_WIRE_VERSION = ${JSON.stringify(
      pirVersion
    )} as PIRWireDocument['version'];\n`;
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, output, 'utf8');

    console.log('PIR types generated successfully.');
    console.log(`   Version: ${pirVersion}`);
    console.log(`   Lines: ${output.split('\n').length}`);
  })
  .catch((error) => {
    console.error('Failed to generate PIR types:', error.message);
    process.exit(1);
  });
