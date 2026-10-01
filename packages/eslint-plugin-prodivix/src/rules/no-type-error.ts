import type { Rule } from 'eslint';
import ts from 'typescript';
import { typedProgram, TYPED_CONFIGURATION_MESSAGE } from '../typedProgram';

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'report TypeScript semantic errors in code authoring modules',
    },
    schema: [],
    messages: {
      diagnostic: 'TypeScript TS{{code}}: {{message}}',
      typedConfiguration: TYPED_CONFIGURATION_MESSAGE,
    },
  },

  create(context): Rule.RuleListener {
    return {
      'Program:exit'(node) {
        const authority = typedProgram(context, node);
        if (!authority) return;
        for (const diagnostic of authority.program.getSemanticDiagnostics(
          authority.sourceFile
        )) {
          if (diagnostic.category !== ts.DiagnosticCategory.Error) continue;
          const start = authority.sourceFile.getLineAndCharacterOfPosition(
            diagnostic.start ?? 0
          );
          const end = authority.sourceFile.getLineAndCharacterOfPosition(
            Math.min(
              authority.sourceFile.text.length,
              (diagnostic.start ?? 0) + (diagnostic.length ?? 0)
            )
          );
          context.report({
            loc: {
              start: { line: start.line + 1, column: start.character },
              end: { line: end.line + 1, column: end.character },
            },
            messageId: 'diagnostic',
            data: {
              code: diagnostic.code,
              message: ts.flattenDiagnosticMessageText(
                diagnostic.messageText,
                '\n'
              ),
            },
          });
        }
      },
    };
  },
};

export = rule;
