import type { Rule } from 'eslint';
import type { ImportDeclaration } from 'estree';
import * as fs from 'fs';
import * as path from 'path';

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'detect circular dependencies in PIR modules',
    },
    messages: {
      circular: 'Circular dependency detected in module graph: {{ chain }}',
    },
  },

  create(context): Rule.RuleListener {
    return {
      ImportDeclaration(node: ImportDeclaration) {
        const currentFile = context.filename;
        const importPath = node.source.value;

        // 检查模块依赖图
        // 需要构建全局模块依赖图并检测环
        // 对于多文件分析，需要在 Program:exit 时检查
      },
    };
  },
};

export = rule;
