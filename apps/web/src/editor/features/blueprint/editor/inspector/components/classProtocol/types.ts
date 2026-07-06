export type ClassSuggestionSource = 'tailwind' | 'native' | 'mounted-css';

export type ClassToken = {
  value: string;
  source: Exclude<ClassSuggestionSource, 'mounted-css'>;
};

export type ClassSuggestion = {
  token: string;
  insertText?: string;
  label?: string;
  detail?: string;
  kind?: 'token' | 'hint';
  hint?:
    | {
        type: 'arbitrary-length-template';
        prefix: string;
      }
    | {
        type: 'color-shade-template';
        prefix: string;
        example: string;
      }
    | undefined;
  source: ClassSuggestionSource;
  score: number;
};

export type ClassSuggestContext = {
  query: string;
  tokens: string[];
  limit: number;
};

export interface ClassProtocolEngine {
  tokenize(input: string): ClassToken[];
  suggest(context: ClassSuggestContext): ClassSuggestion[];
  resolveConflict(tokens: string[]): string[];
}
