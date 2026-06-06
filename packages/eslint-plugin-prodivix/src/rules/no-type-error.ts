import type { Rule } from 'eslint';
import type { BinaryExpression, CallExpression } from 'estree';

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'detect type mismatches in PIR operations',
    },
    messages: {
      mismatch: 'Type mismatch: expected {{ expected }}, got {{ actual }}',
    },
  },

  create(context): Rule.RuleListener {
    return {
      CallExpression(_node: CallExpression) {
        // 检查函数调用参数类型
        // 类型推断
      },

      BinaryExpression(_node: BinaryExpression) {
        // 检查二元操作数类型兼容
      },
    };
  },
};

export = rule;
