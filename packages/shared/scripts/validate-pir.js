import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import chalk from 'chalk';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePirSchemaPath } from './pir-schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const schemaPath = resolvePirSchemaPath();
const ajv = new Ajv({ allErrors: true, verbose: true });
addFormats(ajv);

const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const validate = ajv.compile(schema);
const pirPath = resolve(process.argv[2] || './project.pir.json');

console.log('Validating PIR document...');
console.log(`   Schema: ${schemaPath}`);
console.log(`   File: ${pirPath}`);

try {
  const pir = JSON.parse(readFileSync(pirPath, 'utf8'));
  const valid = validate(pir);

  if (valid) {
    console.log(chalk.green('\nPIR document is valid.'));
    process.exit(0);
  }

  console.error(chalk.red('\nPIR validation failed.'));
  validate.errors?.forEach((error, index) => {
    console.error(
      chalk.red(`\n  ${index + 1}. ${error.instancePath || 'root'}`) +
        chalk.gray(`\n     ${error.message}`) +
        chalk.yellow(`\n     Params: ${JSON.stringify(error.params)}`)
    );
    if (error.schemaPath) {
      console.error(chalk.gray(`     Schema path: ${error.schemaPath}`));
    }
  });
  process.exit(1);
} catch (error) {
  console.error(chalk.red(`\nFatal error: ${error.message}`));
  process.exit(1);
}
