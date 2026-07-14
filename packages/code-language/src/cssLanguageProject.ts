import {
  getCSSLanguageService,
  getSCSSLanguageService,
  type LanguageService,
  type Position,
  type Range,
  type Stylesheet,
} from 'vscode-css-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  createCodeSourceSpanFromOffsets,
  resolveCodeSourceSpanOffsets,
  type CodeArtifact,
  type CodeLanguagePosition,
} from '@prodivix/authoring';

export const CSS_CODE_LANGUAGES = Object.freeze(['css', 'scss'] as const);

export type CssLanguageDocument = Readonly<{
  artifact: CodeArtifact;
  document: TextDocument;
  service: LanguageService;
  stylesheet: Stylesheet;
}>;

export type CssLanguageProject = Readonly<{
  artifacts: readonly CodeArtifact[];
  documents: readonly CssLanguageDocument[];
  getDocument(artifactId: string): CssLanguageDocument | null;
  getDocumentByUri(uri: string): CssLanguageDocument | null;
  getPosition(position: CodeLanguagePosition): Position | null;
  createSourceSpan(
    artifactId: string,
    range: Range
  ): ReturnType<typeof createCodeSourceSpanFromOffsets>;
}>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const isCssArtifact = (artifact: CodeArtifact): boolean =>
  artifact.language === 'css' || artifact.language === 'scss';

const createArtifactUri = (artifact: CodeArtifact): string =>
  `prodivix-code://artifact/${encodeURIComponent(artifact.id)}.${artifact.language}`;

/** Creates immutable browser-safe CSS/SCSS documents over CodeArtifacts. */
export const createCssLanguageProject = (
  inputArtifacts: readonly CodeArtifact[]
): CssLanguageProject => {
  const artifacts = Object.freeze(
    inputArtifacts.filter(isCssArtifact).sort((left, right) => {
      return (
        compareText(left.path, right.path) || compareText(left.id, right.id)
      );
    })
  );
  const cssService = getCSSLanguageService();
  const scssService = getSCSSLanguageService();
  const documentByArtifactId = new Map<string, CssLanguageDocument>();
  const documentByUri = new Map<string, CssLanguageDocument>();

  for (const artifact of artifacts) {
    if (documentByArtifactId.has(artifact.id)) {
      throw new Error(`Duplicate CodeArtifact id "${artifact.id}".`);
    }
    const uri = createArtifactUri(artifact);
    if (documentByUri.has(uri)) {
      throw new Error(
        `CodeArtifact id "${artifact.id}" collides with another CSS document.`
      );
    }
    const service = artifact.language === 'scss' ? scssService : cssService;
    const document = TextDocument.create(
      uri,
      artifact.language,
      1,
      artifact.source
    );
    const entry = Object.freeze({
      artifact,
      document,
      service,
      stylesheet: service.parseStylesheet(document),
    });
    documentByArtifactId.set(artifact.id, entry);
    documentByUri.set(uri, entry);
  }

  const documents = Object.freeze([...documentByArtifactId.values()]);

  return Object.freeze({
    artifacts,
    documents,
    getDocument: (artifactId) => documentByArtifactId.get(artifactId) ?? null,
    getDocumentByUri: (uri) => documentByUri.get(uri) ?? null,
    getPosition(position) {
      const entry = documentByArtifactId.get(position.artifactId);
      if (!entry) return null;
      const offsets = resolveCodeSourceSpanOffsets(entry.artifact.source, {
        artifactId: position.artifactId,
        startLine: position.line,
        startColumn: position.column,
        endLine: position.line,
        endColumn: position.column,
      });
      return offsets ? entry.document.positionAt(offsets.from) : null;
    },
    createSourceSpan(artifactId, range) {
      const entry = documentByArtifactId.get(artifactId);
      if (!entry) return null;
      return createCodeSourceSpanFromOffsets({
        artifactId,
        source: entry.artifact.source,
        from: entry.document.offsetAt(range.start),
        to: entry.document.offsetAt(range.end),
      });
    },
  });
};
