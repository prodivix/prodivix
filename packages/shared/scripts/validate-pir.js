import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SCHEMA_PATH = resolve(__dirname, '../../../specs/pir/PIR-v1.0.json');

// 创建AJV实例
const ajv = new Ajv({ allErrors: true, verbose: true });
addFormats(ajv);

// 编译Schema
const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));
const validate = ajv.compile(schema);

// CLI参数
const pirPath = resolve(process.argv[2] || './project.pir.json');

console.log('🔍 校验PIR文件...');
console.log(`   Schema: ${SCHEMA_PATH}`);
console.log(`   文件: ${pirPath}`);

try {
  const pir = JSON.parse(readFileSync(pirPath, 'utf-8'));
  const valid = validate(pir);

  if (valid) {
    console.log(chalk.green('\n✅ PIR格式正确！'));
    process.exit(0);
  } else {
    console.error(chalk.red('\n❌ 校验失败：'));
    validate.errors?.forEach((error, i) => {
      console.error(
        chalk.red(`\n  ${i + 1}. ${error.instancePath || 'root'}`) +
          chalk.gray(`\n     ${error.message}`) +
          chalk.yellow(`\n     参数: ${JSON.stringify(error.params)}`)
      );
      if (error.schemaPath) {
        console.error(chalk.gray(`     Schema路径: ${error.schemaPath}`));
      }
    });
    process.exit(1);
  }
} catch (error) {
  console.error(chalk.red(`\n💥 致命错误: ${error.message}`));
  process.exit(1);
}
