import type { Rule } from 'eslint';

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow unused local variables in code authoring modules',
      category: 'Best Practices',
      recommended: true,
    },
    schema: [],
    messages: {
      unused: 'Variable "{{ name }}" is declared but never used.',
    },
  },

  create(context): Rule.RuleListener {
    return {
      'Program:exit'() {
        for (const scope of context.sourceCode.scopeManager.scopes) {
          for (const variable of scope.variables) {
            const declaration = variable.defs.find(
              (definition) => definition.type === 'Variable'
            );
            const identifier = variable.identifiers[0];
            if (
              declaration &&
              identifier &&
              !variable.references.some((reference) => reference.isRead()) &&
              !context.sourceCode
                .getAncestors(declaration.node)
                .some(
                  (node) =>
                    node.type === 'ExportNamedDeclaration' ||
                    node.type === 'ExportDefaultDeclaration'
                )
            ) {
              context.report({
                node: identifier,
                messageId: 'unused',
                data: { name: variable.name },
              });
            }
          }
        }
      },
    };
  },
};

export = rule;
