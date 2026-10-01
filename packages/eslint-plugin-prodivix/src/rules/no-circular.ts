import { relative } from 'node:path';
import type { Rule } from 'eslint';
import ts from 'typescript';
import { typedProgram, TYPED_CONFIGURATION_MESSAGE } from '../typedProgram';

type Edge = Readonly<{ target: string; specifier: ts.Expression }>;
type Graph = ReadonlyMap<string, readonly Edge[]>;
const graphs = new WeakMap<ts.Program, Graph>();

const moduleGraph = (program: ts.Program): Graph => {
  const cached = graphs.get(program);
  if (cached) return cached;
  const checker = program.getTypeChecker();
  const graph = new Map<string, readonly Edge[]>();
  for (const file of program.getSourceFiles()) {
    if (file.isDeclarationFile) continue;
    const edges: Edge[] = [];
    for (const node of file.statements) {
      let specifier: ts.Expression | undefined;
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        if (
          clause?.isTypeOnly ||
          (clause &&
            !clause.name &&
            clause.namedBindings &&
            ts.isNamedImports(clause.namedBindings) &&
            clause.namedBindings.elements.length > 0 &&
            clause.namedBindings.elements.every((entry) => entry.isTypeOnly))
        )
          continue;
        specifier = node.moduleSpecifier;
      } else if (ts.isExportDeclaration(node)) {
        if (
          node.isTypeOnly ||
          (node.exportClause &&
            ts.isNamedExports(node.exportClause) &&
            node.exportClause.elements.length > 0 &&
            node.exportClause.elements.every((entry) => entry.isTypeOnly))
        )
          continue;
        specifier = node.moduleSpecifier;
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        !node.isTypeOnly &&
        ts.isExternalModuleReference(node.moduleReference)
      )
        specifier = node.moduleReference.expression;
      if (!specifier) continue;
      const target = checker
        .getSymbolAtLocation(specifier)
        ?.declarations?.find(ts.isSourceFile);
      if (target && !target.isDeclarationFile)
        edges.push({ target: target.fileName, specifier });
    }
    graph.set(file.fileName, edges);
  }
  graphs.set(program, graph);
  return graph;
};

const pathTo = (
  graph: Graph,
  from: string,
  to: string
): readonly string[] | undefined => {
  const queue: string[][] = [[from]];
  const visited = new Set<string>();
  for (let index = 0; index < queue.length; index++) {
    const path = queue[index]!;
    const current = path[path.length - 1]!;
    if (current === to) return path;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of graph.get(current) ?? [])
      if (!visited.has(edge.target)) queue.push([...path, edge.target]);
  }
  return undefined;
};

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'detect runtime module cycles using TypeScript module resolution',
    },
    schema: [],
    messages: {
      circular: 'Circular module dependency: {{chain}}',
      typedConfiguration: TYPED_CONFIGURATION_MESSAGE,
    },
  },

  create(context): Rule.RuleListener {
    return {
      'Program:exit'(node) {
        const authority = typedProgram(context, node);
        if (!authority) return;
        const graph = moduleGraph(authority.program);
        for (const edge of graph.get(authority.sourceFile.fileName) ?? []) {
          const path = pathTo(
            graph,
            edge.target,
            authority.sourceFile.fileName
          );
          if (!path) continue;
          const start = authority.sourceFile.getLineAndCharacterOfPosition(
            edge.specifier.getStart(authority.sourceFile)
          );
          const end = authority.sourceFile.getLineAndCharacterOfPosition(
            edge.specifier.getEnd()
          );
          context.report({
            loc: {
              start: { line: start.line + 1, column: start.character },
              end: { line: end.line + 1, column: end.character },
            },
            messageId: 'circular',
            data: {
              chain: [authority.sourceFile.fileName, ...path]
                .map((file) =>
                  relative(process.cwd(), file).split('\\').join('/')
                )
                .join(' -> '),
            },
          });
        }
      },
    };
  },
};

export = rule;
