import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const specsDir = path.join(rootDir, 'specs', 'diagnostics');
const docsDir = path.join(rootDir, 'apps', 'docs', 'reference');
const diagnosticPagesDir = path.join(docsDir, 'diagnostics');
const indexPath = path.join(docsDir, 'diagnostic-codes.md');
const mode = process.argv[2] ?? 'generate';

const domainOrder = [
  'PIR',
  'WKS',
  'PLG',
  'EDT',
  'UX',
  'COD',
  'SEM',
  'GEN',
  'API',
  'AI',
  'RTE',
  'NGR',
  'ANI',
];

const domainInfo = {
  PIR: {
    file: 'pir-diagnostic-codes.md',
    title: 'PIR',
    area: 'PIR 文档',
    description: '文档形状、UI graph、ValueRef、materialize 和运行前校验',
  },
  WKS: {
    file: 'workspace-diagnostic-codes.md',
    title: 'Workspace',
    area: '工作区',
    description: '工作区加载、文档保存、同步冲突、capability 和 patch 应用',
  },
  PLG: {
    file: 'plugin-diagnostic-codes.md',
    title: 'Plugin',
    area: '插件',
    description:
      'Plugin Manifest、contribution contract、权限、注册事务和 runtime lifecycle',
  },
  EDT: {
    file: 'editor-diagnostic-codes.md',
    title: 'Editor',
    area: '编辑器',
    description: '选择、拖拽、Inspector、画布、命令和 autosave',
  },
  UX: {
    file: 'ux-diagnostic-codes.md',
    title: 'UX',
    area: '用户体验',
    description: '可访问性、交互、响应式布局、内容、视觉反馈和体验检查器',
  },
  COD: {
    file: 'code-diagnostic-codes.md',
    title: 'Code',
    area: '用户代码',
    description: '代码片段、符号解析、类型、宿主绑定、运行时和转译编译',
  },
  SEM: {
    file: 'semantic-diagnostic-codes.md',
    title: 'Semantic',
    area: '跨领域语义',
    description: 'Workspace 级符号、作用域、引用解析、能力约束和快照一致性',
  },
  GEN: {
    file: 'codegen-diagnostic-codes.md',
    title: 'Codegen',
    area: '代码生成',
    description: 'Canonical IR、adapter、依赖解析、代码发射和导出产物',
  },
  API: {
    file: 'api-diagnostic-codes.md',
    title: 'Backend/API',
    area: '后端/API',
    description: '请求、鉴权、权限、业务校验、持久化和第三方集成',
  },
  AI: {
    file: 'ai-diagnostic-codes.md',
    title: 'AI',
    area: 'AI 助手',
    description: 'Provider、模型发现、Prompt、响应解析和 AI command',
  },
  RTE: {
    file: 'route-diagnostic-codes.md',
    title: 'Route',
    area: '路由',
    description: '路由清单、匹配、Outlet、导航和运行时',
  },
  NGR: {
    file: 'nodegraph-diagnostic-codes.md',
    title: 'NodeGraph',
    area: '节点图',
    description: '节点图结构、端口、连线、执行和调试',
  },
  ANI: {
    file: 'animation-diagnostic-codes.md',
    title: 'Animation',
    area: '动画',
    description: 'Timeline、binding、track、keyframe、filter 和预览运行时',
  },
};

function normalizeNewlines(content) {
  return content.replace(/\r\n/g, '\n');
}

function slugForCode(code) {
  return code.toLowerCase();
}

function slugForDomain(domain) {
  return domain.toLowerCase();
}

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeUtf8(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
}

async function formatMarkdown(content) {
  return prettier.format(content, {
    parser: 'markdown',
    proseWrap: 'preserve',
  });
}

function parseBoolean(value) {
  return value.trim() === 'true';
}

function parseStandardSpec(domain, source) {
  const lines = normalizeNewlines(source).split('\n');
  const diagnostics = [];

  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^### `([A-Z]+-\d{4})` (.+)$/);

    if (!heading) {
      continue;
    }

    const diagnostic = {
      domain,
      code: heading[1],
      title: heading[2].trim(),
      severity: 'error',
      stage: 'unknown',
      retryable: false,
      trigger: '对应功能链路返回该诊断码。',
      action: '按页面提示重试；若问题复现，携带错误码与项目上下文上报。',
    };

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (lines[cursor].startsWith('### ') || lines[cursor].startsWith('## ')) {
        break;
      }

      const field = lines[cursor].match(/^- ([^:]+):\s*(.*)$/);

      if (!field) {
        continue;
      }

      const key = field[1].trim().toLowerCase();
      const value = field[2].trim();

      if (key === 'severity') {
        diagnostic.severity = value.replaceAll('`', '');
      } else if (key === 'stage') {
        diagnostic.stage = value.replaceAll('`', '');
      } else if (key === 'retryable') {
        diagnostic.retryable = parseBoolean(value);
      } else if (key === 'trigger') {
        diagnostic.trigger = value;
      } else if (key === 'user action') {
        diagnostic.action = value;
      }
    }

    diagnostics.push(diagnostic);
  }

  return diagnostics;
}

function readDiagnostics() {
  const grouped = new Map();

  for (const domain of domainOrder) {
    const info = domainInfo[domain];
    const specPath = path.join(specsDir, info.file);
    const source = readUtf8(specPath);
    const diagnostics = parseStandardSpec(domain, source);

    grouped.set(
      domain,
      diagnostics.sort((left, right) => left.code.localeCompare(right.code))
    );
  }

  validatePluginDiagnosticCoverage(grouped.get('PLG') ?? []);

  return grouped;
}

function validatePluginDiagnosticCoverage(specDiagnostics) {
  const sourcePath = path.join(
    rootDir,
    'packages',
    'plugin-contracts',
    'src',
    'diagnostics.ts'
  );
  const sourceCodes = new Set(
    [...readUtf8(sourcePath).matchAll(/'(?<code>PLG-\d{4})'/g)].map(
      (match) => match.groups.code
    )
  );
  const specCodes = new Set(
    specDiagnostics.map((diagnostic) => diagnostic.code)
  );
  const missingFromSpec = [...sourceCodes].filter(
    (code) => !specCodes.has(code)
  );
  const missingFromSource = [...specCodes].filter(
    (code) => !sourceCodes.has(code)
  );

  if (missingFromSpec.length > 0 || missingFromSource.length > 0) {
    throw new Error(
      `PLG diagnostic code drift: source-only=[${missingFromSpec.join(', ')}], spec-only=[${missingFromSource.join(', ')}]`
    );
  }
}

function renderRetryable(value) {
  return value ? '是' : '否';
}

function renderDiagnosticPage(diagnostic) {
  const info = domainInfo[diagnostic.domain];

  return `---
lastUpdated: false
---

# ${diagnostic.code} ${diagnostic.title}

## 快速信息

| 名称 | 说明 |
| --- | --- |
| 前缀 | ${diagnostic.domain} |
| 范围 | ${info.area} |
| 严重程度 | \`${diagnostic.severity}\` |
| 阶段 | \`${diagnostic.stage}\` |
| 可重试 | ${renderRetryable(diagnostic.retryable)} |

## 含义

${diagnostic.code} 表示 ${diagnostic.title}。请先确认当前页面、项目状态和最近操作，再按建议操作处理。

## 触发条件

${diagnostic.trigger}

## 建议操作

${diagnostic.action}

## 上报时提供

- 错误码和 requestId
- 当前项目或工作区 ID
- 触发该错误的操作
- 可复现时的最小文档或配置

[返回错误码索引](/reference/diagnostic-codes)
`;
}

function renderDomainIndex(domain, diagnostics) {
  const info = domainInfo[domain];
  const lines = [
    '---',
    'lastUpdated: false',
    '---',
    '',
    `# ${info.title} 错误码`,
    '',
    `${info.title} 命名空间覆盖${info.description}。`,
    '',
    '| Code | 名称 | 严重程度 |',
    '| --- | --- | --- |',
  ];

  for (const diagnostic of diagnostics) {
    lines.push(
      `| [\`${diagnostic.code}\`](/reference/diagnostics/${slugForCode(diagnostic.code)}) | ${diagnostic.title} | \`${diagnostic.severity}\` |`
    );
  }

  lines.push('', '[返回错误码索引](/reference/diagnostic-codes)', '');

  return lines.join('\n');
}

function renderIndex(groupedDiagnostics) {
  const lines = [
    '# 错误码索引',
    '',
    'Prodivix 使用稳定错误码帮助定位问题。每个错误码都对应独立说明页，用于快速理解含义、确认触发条件，并找到建议处理方式。',
    '',
    '## 如何使用',
    '',
    '1. 在界面或响应中找到稳定错误码，例如 `WKS-4003`。',
    '2. 打开对应的错误码页面，先看严重程度、阶段和触发条件。',
    '3. 按建议操作修复。若需要上报，使用下方模板。',
    '',
    '## 上报模板',
    '',
    '```txt',
    '错误码',
    'requestId',
    '操作时间',
    '当前项目或工作区',
    '复现步骤',
    '错误截图或日志摘要',
    '```',
    '',
    '不要上报 API key、Token、完整 Prompt 或其他敏感内容。',
    '',
    '## 编码域',
    '',
    '| 前缀 | 范围 | 说明 |',
    '| --- | --- | --- |',
  ];

  for (const domain of domainOrder) {
    const info = domainInfo[domain];
    lines.push(`| \`${domain}-xxxx\` | ${info.area} | ${info.description} |`);
  }

  lines.push('', '## 命名空间索引', '');

  for (const domain of domainOrder) {
    lines.push(
      `- [${domainInfo[domain].title}](/reference/diagnostics/${slugForDomain(domain)})`
    );
  }

  lines.push('', '## 所有错误码');

  for (const domain of domainOrder) {
    const diagnostics = groupedDiagnostics.get(domain) ?? [];

    if (diagnostics.length === 0) {
      continue;
    }

    lines.push(
      '',
      `### ${domainInfo[domain].title}`,
      '',
      '| Code | 名称 | 严重程度 |',
      '| --- | --- | --- |'
    );

    for (const diagnostic of diagnostics) {
      lines.push(
        `| [\`${diagnostic.code}\`](/reference/diagnostics/${slugForCode(diagnostic.code)}) | ${diagnostic.title} | \`${diagnostic.severity}\` |`
      );
    }
  }

  lines.push(
    '',
    '## Backend API',
    '',
    '后端 API 错误响应会将稳定错误码放在 `error.code` 中，并可能同时返回 `requestId`。',
    '',
    '```json',
    '{',
    '  "error": {',
    '    "code": "WKS-4003",',
    '    "message": "Revision conflict.",',
    '    "requestId": "req_...",',
    '    "retryable": true,',
    '    "details": {}',
    '  }',
    '}',
    '```',
    ''
  );

  return lines.join('\n');
}

async function buildExpectedFiles() {
  const groupedDiagnostics = readDiagnostics();
  const expected = new Map();

  expected.set(
    indexPath,
    await formatMarkdown(renderIndex(groupedDiagnostics))
  );

  for (const diagnostics of groupedDiagnostics.values()) {
    if (diagnostics.length > 0) {
      const domain = diagnostics[0].domain;
      expected.set(
        path.join(diagnosticPagesDir, `${slugForDomain(domain)}.md`),
        await formatMarkdown(renderDomainIndex(domain, diagnostics))
      );
    }

    for (const diagnostic of diagnostics) {
      expected.set(
        path.join(diagnosticPagesDir, `${slugForCode(diagnostic.code)}.md`),
        await formatMarkdown(renderDiagnosticPage(diagnostic))
      );
    }
  }

  return expected;
}

function listActualDiagnosticPages() {
  if (!fs.existsSync(diagnosticPagesDir)) {
    return [];
  }

  return fs
    .readdirSync(diagnosticPagesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(diagnosticPagesDir, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function hasSuspiciousReplacementQuestion(content) {
  return /[^\x00-\x7F]\?|\?[^\x00-\x7F]|\?{2,}/.test(content);
}

function validateDiagnosticsShape(groupedDiagnostics) {
  const seenCodes = new Set();
  const errors = [];

  for (const [domain, diagnostics] of groupedDiagnostics.entries()) {
    for (const diagnostic of diagnostics) {
      if (!new RegExp(`^${domain}-\\d{4}$`).test(diagnostic.code)) {
        errors.push(`Invalid code format: ${diagnostic.code}`);
      }

      if (seenCodes.has(diagnostic.code)) {
        errors.push(`Duplicate diagnostic code: ${diagnostic.code}`);
      }

      seenCodes.add(diagnostic.code);
    }
  }

  return errors;
}

async function generate() {
  const expectedFiles = await buildExpectedFiles();

  fs.mkdirSync(diagnosticPagesDir, { recursive: true });

  for (const actualPage of listActualDiagnosticPages()) {
    if (!expectedFiles.has(actualPage)) {
      fs.unlinkSync(actualPage);
    }
  }

  for (const [filePath, content] of expectedFiles.entries()) {
    writeUtf8(filePath, content);
  }

  console.log(`Generated ${expectedFiles.size - 1} diagnostic pages.`);
}

async function check() {
  const groupedDiagnostics = readDiagnostics();
  const expectedFiles = await buildExpectedFiles();
  const actualPages = listActualDiagnosticPages();
  const errors = validateDiagnosticsShape(groupedDiagnostics);

  for (const actualPage of actualPages) {
    if (!expectedFiles.has(actualPage)) {
      errors.push(
        `Unexpected diagnostic page: ${path.relative(rootDir, actualPage)}`
      );
    }
  }

  for (const [filePath, expectedContent] of expectedFiles.entries()) {
    if (!fs.existsSync(filePath)) {
      errors.push(
        `Missing generated file: ${path.relative(rootDir, filePath)}`
      );
      continue;
    }

    const actualContent = readUtf8(filePath);

    if (actualContent !== expectedContent) {
      errors.push(
        `Outdated generated file: ${path.relative(rootDir, filePath)}`
      );
    }

    if (hasSuspiciousReplacementQuestion(actualContent)) {
      errors.push(
        `Suspicious question mark replacement: ${path.relative(rootDir, filePath)}`
      );
    }
  }

  const indexContent = fs.existsSync(indexPath) ? readUtf8(indexPath) : '';

  for (const diagnostics of groupedDiagnostics.values()) {
    for (const diagnostic of diagnostics) {
      const link = `/reference/diagnostics/${slugForCode(diagnostic.code)}`;

      if (!indexContent.includes(link)) {
        errors.push(`Missing index link for ${diagnostic.code}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
    return;
  }

  console.log(`Checked ${expectedFiles.size - 1} diagnostic pages.`);
}

if (mode === 'generate') {
  await generate();
} else if (mode === 'check') {
  await check();
} else {
  console.error(
    'Usage: node scripts/generate-diagnostic-docs.mjs [generate|check]'
  );
  process.exitCode = 1;
}
