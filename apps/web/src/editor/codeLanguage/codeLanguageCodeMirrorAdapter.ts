import {
  autocompletion,
  snippet,
  type Completion,
  type CompletionSource,
} from '@codemirror/autocomplete';
import {
  linter,
  type Diagnostic as CodeMirrorDiagnostic,
} from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import { hoverTooltip, keymap, type EditorView } from '@codemirror/view';
import {
  createCodeSourceSpanFromOffsets,
  resolveCodeSourceSpanOffsets,
  type CodeLanguageCompletion,
  type CodeLanguageDefinitionResult,
  type CodeLanguageHover,
  type CodeLanguageLocation,
  type CodeLanguagePosition,
  type CodeLanguageSession,
} from '@prodivix/authoring';
import type { ProdivixDiagnostic } from '@prodivix/diagnostics';

export const createCodeLanguagePositionAtOffset = (input: {
  artifactId: string;
  source: string;
  offset: number;
}): CodeLanguagePosition | null => {
  const sourceSpan = createCodeSourceSpanFromOffsets({
    artifactId: input.artifactId,
    source: input.source,
    from: input.offset,
    to: input.offset,
  });
  return sourceSpan
    ? Object.freeze({
        artifactId: input.artifactId,
        line: sourceSpan.startLine,
        column: sourceSpan.startColumn,
      })
    : null;
};

const mapSeverity = (
  severity: ProdivixDiagnostic['severity']
): CodeMirrorDiagnostic['severity'] =>
  severity === 'fatal' ? 'error' : severity;

export const projectCodeLanguageDiagnostics = (input: {
  artifactId: string;
  source: string;
  diagnostics: readonly ProdivixDiagnostic[];
}): readonly CodeMirrorDiagnostic[] =>
  Object.freeze(
    input.diagnostics.flatMap((diagnostic) => {
      const sourceSpan = diagnostic.sourceSpan;
      if (!sourceSpan || sourceSpan.artifactId !== input.artifactId) return [];
      const offsets = resolveCodeSourceSpanOffsets(input.source, sourceSpan);
      if (!offsets) return [];
      return [
        Object.freeze({
          from: offsets.from,
          to: offsets.to,
          severity: mapSeverity(diagnostic.severity),
          source: `Prodivix ${diagnostic.code}`,
          message: diagnostic.message,
        }),
      ];
    })
  );

export type CodeLanguageHoverProjection = Readonly<{
  from: number;
  to: number;
  text: string;
}>;

export const projectCodeLanguageHover = (input: {
  artifactId: string;
  source: string;
  offset: number;
  hover: CodeLanguageHover;
}): CodeLanguageHoverProjection | null => {
  const text = input.hover.contents
    .map(({ value }) => value.trim())
    .filter(Boolean)
    .join('\n\n');
  if (!text) return null;
  const offsets =
    input.hover.sourceSpan?.artifactId === input.artifactId
      ? resolveCodeSourceSpanOffsets(input.source, input.hover.sourceSpan)
      : null;
  return Object.freeze({
    from: offsets?.from ?? input.offset,
    to: offsets?.to ?? input.offset,
    text,
  });
};

const completionType = (
  completion: CodeLanguageCompletion
): Completion['type'] => {
  if (completion.kind === 'keyword') return 'keyword';
  if (completion.kind === 'path') return 'text';
  if (completion.kind === 'snippet') return 'text';
  return 'variable';
};

const projectCompletion = (input: {
  artifactId: string;
  source: string;
  completion: CodeLanguageCompletion;
}): Completion => {
  const edit = input.completion.textEdit;
  const editOffsets =
    edit?.artifactId === input.artifactId
      ? resolveCodeSourceSpanOffsets(input.source, edit.sourceSpan)
      : null;
  const insertText = input.completion.insertText ?? input.completion.label;
  return {
    label: input.completion.label,
    type: completionType(input.completion),
    ...(input.completion.detail ? { detail: input.completion.detail } : {}),
    ...(input.completion.sortText
      ? { sortText: input.completion.sortText }
      : {}),
    ...(input.completion.documentation?.value
      ? { info: input.completion.documentation.value }
      : {}),
    apply:
      edit && editOffsets
        ? (view, completion) => {
            if (view.state.doc.toString() !== input.source) return;
            if (input.completion.kind === 'snippet') {
              snippet(edit.newText)(
                view,
                completion,
                editOffsets.from,
                editOffsets.to
              );
              return;
            }
            view.dispatch({
              changes: {
                from: editOffsets.from,
                to: editOffsets.to,
                insert: edit.newText,
              },
            });
          }
        : input.completion.kind === 'snippet'
          ? snippet(insertText)
          : insertText,
  };
};

export const requestCodeLanguageDefinition = async (input: {
  session: CodeLanguageSession;
  artifactId: string;
  source: string;
  offset: number;
}): Promise<CodeLanguageDefinitionResult | null> => {
  const position = createCodeLanguagePositionAtOffset(input);
  if (!position) return null;
  return input.session.getDefinition({
    expectedSnapshotIdentity: input.session.snapshotIdentity,
    position,
  });
};

export const createCodeLanguageCodeMirrorExtensions = (input: {
  session: CodeLanguageSession;
  artifactId: string;
  source: string;
  onOpenLocation(location: CodeLanguageLocation, view: EditorView): void;
  onDefinitionResult?(result: CodeLanguageDefinitionResult | null): void;
}): readonly Extension[] => {
  const hasCurrentSource = (view: EditorView): boolean =>
    view.state.doc.toString() === input.source;

  const completionSource: CompletionSource = async (context) => {
    if (!hasCurrentSource(context.view)) return null;
    const position = createCodeLanguagePositionAtOffset({
      artifactId: input.artifactId,
      source: input.source,
      offset: context.pos,
    });
    if (!position) return null;
    const result = await input.session.getCompletions({
      expectedSnapshotIdentity: input.session.snapshotIdentity,
      position,
      trigger: { kind: 'invoked' },
    });
    if (result.status !== 'resolved' || !hasCurrentSource(context.view)) {
      return null;
    }
    const word = context.matchBefore(/[-\w$@.#]*/);
    return {
      from: word?.from ?? context.pos,
      options: result.value.map((completion) =>
        projectCompletion({
          artifactId: input.artifactId,
          source: input.source,
          completion,
        })
      ),
      validFor: /^[-\w$@.#]*$/,
    };
  };

  const diagnostics = linter(
    async (view) => {
      if (!hasCurrentSource(view)) return [];
      const result = await input.session.getDiagnostics({
        expectedSnapshotIdentity: input.session.snapshotIdentity,
        artifactId: input.artifactId,
      });
      if (result.status !== 'resolved' || !hasCurrentSource(view)) return [];
      return projectCodeLanguageDiagnostics({
        artifactId: input.artifactId,
        source: input.source,
        diagnostics: result.value,
      });
    },
    { delay: 180 }
  );

  const hover = hoverTooltip(
    async (view, offset) => {
      if (!hasCurrentSource(view)) return null;
      const position = createCodeLanguagePositionAtOffset({
        artifactId: input.artifactId,
        source: input.source,
        offset,
      });
      if (!position) return null;
      const result = await input.session.getHover({
        expectedSnapshotIdentity: input.session.snapshotIdentity,
        position,
      });
      if (result.status !== 'resolved' || !hasCurrentSource(view)) return null;
      const projection = projectCodeLanguageHover({
        artifactId: input.artifactId,
        source: input.source,
        offset,
        hover: result.value,
      });
      if (!projection) return null;
      return {
        pos: projection.from,
        end: projection.to,
        above: true,
        create() {
          const dom = document.createElement('div');
          dom.className = 'cm-code-language-hover';
          dom.textContent = projection.text;
          return { dom };
        },
      };
    },
    { hideOnChange: true }
  );

  const definitionKeymap = keymap.of([
    {
      key: 'F12',
      run(view) {
        if (!hasCurrentSource(view)) return false;
        void requestCodeLanguageDefinition({
          session: input.session,
          artifactId: input.artifactId,
          source: input.source,
          offset: view.state.selection.main.head,
        }).then((result) => {
          input.onDefinitionResult?.(result);
          if (result?.status === 'resolved' && result.value[0]) {
            input.onOpenLocation(result.value[0], view);
          }
        });
        return true;
      },
    },
  ]);

  return Object.freeze([
    autocompletion({ override: [completionSource] }),
    diagnostics,
    hover,
    definitionKeymap,
  ]);
};
