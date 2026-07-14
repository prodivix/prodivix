import type {
  CodeLanguageDefinitionResult,
  CodeLanguageLocation,
  CodeLanguageReferencesResult,
} from '@prodivix/authoring';

export type CodeLanguageLocationQueryKind = 'definition' | 'references';

export type CodeLanguageLocationQueryView = Readonly<{
  status: 'idle' | 'loading' | 'resolved' | 'missing' | 'unavailable';
  kind?: CodeLanguageLocationQueryKind;
  locations: readonly CodeLanguageLocation[];
}>;

export const EMPTY_CODE_LANGUAGE_LOCATION_QUERY: CodeLanguageLocationQueryView =
  Object.freeze({ status: 'idle', locations: Object.freeze([]) });

export const createLoadingCodeLanguageLocationQuery = (
  kind: CodeLanguageLocationQueryKind
): CodeLanguageLocationQueryView =>
  Object.freeze({
    status: 'loading',
    kind,
    locations: Object.freeze([]),
  });

export const projectCodeLanguageLocationQuery = (input: {
  kind: CodeLanguageLocationQueryKind;
  result: CodeLanguageDefinitionResult | CodeLanguageReferencesResult | null;
}): CodeLanguageLocationQueryView => {
  if (!input.result || input.result.status === 'missing') {
    return Object.freeze({
      status: 'missing',
      kind: input.kind,
      locations: Object.freeze([]),
    });
  }
  if (input.result.status === 'resolved') {
    const locations = Object.freeze([...input.result.value]);
    return Object.freeze({
      status: locations.length ? 'resolved' : 'missing',
      kind: input.kind,
      locations,
    });
  }
  return Object.freeze({
    status: 'unavailable',
    kind: input.kind,
    locations: Object.freeze([]),
  });
};
