import { compile } from 'json-schema-to-typescript';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_PATH = path.resolve(__dirname, '../src/types/pir.generated.ts');
const CURRENT_SCHEMA_PATH = path.resolve(
  __dirname,
  '../../../specs/pir/PIR-current.json'
);

const readSchema = (schemaPath) => {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  return {
    ...schema,
    title: 'PIRDocument',
  };
};

const getPirVersion = (schema) => {
  const version = schema?.properties?.version?.const;
  if (typeof version !== 'string' || !version.trim()) {
    throw new Error('PIR schema must define properties.version.const.');
  }
  return version;
};

const resolveSchemaPath = () => {
  const explicitPath = process.env.PIR_SCHEMA_PATH;
  if (!explicitPath) return CURRENT_SCHEMA_PATH;
  return path.resolve(process.cwd(), explicitPath);
};

const schemaPath = resolveSchemaPath();
const schema = readSchema(schemaPath);
const pirVersion = getPirVersion(schema);
const sourceLabel = path.relative(
  path.resolve(__dirname, '../../..'),
  schemaPath
);

console.log('Generating PIR TypeScript types from schema...');
console.log(`   Schema: ${schemaPath}`);
console.log(`   Output: ${OUTPUT_PATH}`);

compile(schema, 'PIRDocument', {
  bannerComment: `/* eslint-disable */\n/**\n * Generated from ${sourceLabel.replaceAll('\\', '/')}\n * DO NOT EDIT - Run \`pnpm --filter @prodivix/shared generate-types\` to regenerate.\n */`,
  format: true,
  ignoreMinAndMaxItems: true,
  style: {
    singleQuote: true,
    semi: true,
    tabWidth: 2,
  },
})
  .then((ts) => {
    const output = `${ts}\nexport const CURRENT_PIR_VERSION = ${JSON.stringify(
      pirVersion
    )} as PIRDocument['version'];\n`;
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
