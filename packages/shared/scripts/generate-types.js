const { compileFromFile } = require('json-schema-to-typescript');
const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.join(__dirname, '../../../specs/pir/PIR-v1.0.json');
const OUTPUT_PATH = path.join(__dirname, '../src/types/pir.ts');

console.log('📄 从Schema生成TS类型...');
console.log(`   Schema: ${SCHEMA_PATH}`);
console.log(`   输出: ${OUTPUT_PATH}`);

compileFromFile(SCHEMA_PATH, {
  bannerComment:
    '/* eslint-disable */\n/**\n * Generated from PIR Schema v1.0\n * DO NOT EDIT - Run `pnpm run generate-types` to regenerate\n */',
  format: true,
  style: {
    singleQuote: true,
    semi: true,
    tabWidth: 2,
  },
})
  .then((ts) => {
    // 确保目录存在
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });

    // 写入文件
    fs.writeFileSync(OUTPUT_PATH, ts);

    console.log('✅ 类型生成成功！');
    console.log(`   共生成 ${ts.split('\n').length} 行类型定义`);
  })
  .catch((err) => {
    console.error('❌ 生成失败:', err.message);
    process.exit(1);
  });
