import type { Rule } from 'eslint';
import type { Program } from 'estree';
import type ts from 'typescript';

export const typedProgram = (
  context: Rule.RuleContext,
  node: Program
): Readonly<{ program: ts.Program; sourceFile: ts.SourceFile }> | undefined => {
  const services = context.sourceCode.parserServices as {
    program?: ts.Program;
    esTreeNodeToTSNodeMap?: ReadonlyMap<object, ts.Node>;
  };
  const sourceFile = services.esTreeNodeToTSNodeMap?.get(node)?.getSourceFile();
  if (
    !services.program ||
    !sourceFile ||
    services.program.getSourceFile(sourceFile.fileName) !== sourceFile
  ) {
    context.report({ node, messageId: 'typedConfiguration' });
    return undefined;
  }
  return { program: services.program, sourceFile };
};

export const TYPED_CONFIGURATION_MESSAGE =
  'This rule requires a TypeScript parser with a Program for this file. Configure parserOptions.projectService or parserOptions.project.';
