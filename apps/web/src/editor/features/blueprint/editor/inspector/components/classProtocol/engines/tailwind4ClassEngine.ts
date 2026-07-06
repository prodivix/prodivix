import { twMerge } from 'tailwind-merge';
import tailwindCatalog from '@/editor/features/blueprint/editor/inspector/components/classProtocol/tailwind4.catalog.json';
import type {
  ClassProtocolEngine,
  ClassSuggestion,
} from '@/editor/features/blueprint/editor/inspector/components/classProtocol/types';
import { parseClassProtocolTokens } from '@/editor/features/blueprint/editor/inspector/components/classProtocol/tokenizer';
import {
  isArbitraryTailwindToken,
  parseTailwindSuggestionQuery,
} from './tailwindQueryParser';
import {
  TAILWIND_RUNTIME_CLASSES,
  TAILWIND_RUNTIME_VARIANTS,
} from './tailwindRuntimeSource';
import { CSS_LENGTH_OR_PERCENTAGE_UNITS } from '@/editor/features/blueprint/editor/inspector/components/units/cssUnits';

const TAILWIND_CLASSES = [
  ...new Set([
    ...(tailwindCatalog.classes as string[]),
    ...TAILWIND_RUNTIME_CLASSES,
  ]),
];
const TAILWIND_VARIANTS = [
  ...new Set([
    ...(tailwindCatalog.variants as string[]),
    ...TAILWIND_RUNTIME_VARIANTS,
  ]),
];

const COMMON_VARIANTS = [
  'hover',
  'focus',
  'active',
  'disabled',
  'dark',
  'sm',
  'md',
  'lg',
  'xl',
];

const normalizeForFuzzyMatch = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, '');
const splitUtilitySegments = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const SCALE_TOKEN_PATTERN = /^-?(?:\d+|\d*\.\d+|px)$/;
const NUMERIC_LITERAL_PATTERN = /^-?(?:\d+|\d*\.\d+)$/;
const DEFAULT_SPACING_BASE_PX = 4;

const inferArbitraryLengthPrefixes = (classes: string[]) => {
  const counts = new Map<string, number>();
  classes.forEach((utility) => {
    const match = utility.match(/^(.*)-([^-]+)$/);
    if (!match) return;
    const prefix = match[1]?.trim();
    const scaleToken = match[2]?.trim();
    if (!prefix || !scaleToken) return;
    if (!SCALE_TOKEN_PATTERN.test(scaleToken)) return;
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  });
  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count >= 2)
      .map(([prefix]) => prefix)
  );
};

const inferScaleTokensByPrefix = (classes: string[]) => {
  const map = new Map<string, Set<string>>();
  classes.forEach((utility) => {
    const match = utility.match(/^(.*)-([^-]+)$/);
    if (!match) return;
    const prefix = match[1]?.trim();
    const scaleToken = match[2]?.trim();
    if (!prefix || !scaleToken) return;
    if (!SCALE_TOKEN_PATTERN.test(scaleToken)) return;
    const current = map.get(prefix) ?? new Set<string>();
    current.add(scaleToken);
    map.set(prefix, current);
  });
  return map;
};

const ARBITRARY_LENGTH_PREFIXES =
  inferArbitraryLengthPrefixes(TAILWIND_CLASSES);
const SCALE_TOKENS_BY_PREFIX = inferScaleTokensByPrefix(TAILWIND_CLASSES);

const inferColorShadePrefixes = (classes: string[]) => {
  const familySummary = new Map<
    string,
    { prefixes: Set<string>; shades: Set<string> }
  >();
  const prefixToShades = new Map<string, Set<string>>();

  classes.forEach((utility) => {
    const match = utility.match(/^(.+)-([a-z][a-z0-9-]*)-(\d{1,4})$/i);
    if (!match) return;
    const prefix = match[1]?.trim().toLowerCase();
    const family = match[2]?.trim().toLowerCase();
    const shade = match[3]?.trim();
    if (!prefix || !family || !shade) return;

    const summary = familySummary.get(family) ?? {
      prefixes: new Set<string>(),
      shades: new Set<string>(),
    };
    summary.prefixes.add(prefix);
    summary.shades.add(shade);
    familySummary.set(family, summary);

    const prefixKey = `${prefix}-${family}`;
    const shades = prefixToShades.get(prefixKey) ?? new Set<string>();
    shades.add(shade);
    prefixToShades.set(prefixKey, shades);
  });

  const colorFamilies = new Set(
    [...familySummary.entries()]
      .filter(
        ([, summary]) => summary.prefixes.size >= 3 && summary.shades.size >= 3
      )
      .map(([family]) => family)
  );

  const colorPrefixShades = new Map<string, string[]>();
  prefixToShades.forEach((shades, prefix) => {
    const family = prefix.slice(prefix.lastIndexOf('-') + 1);
    if (!colorFamilies.has(family)) return;
    if (shades.size < 2) return;
    colorPrefixShades.set(
      prefix,
      [...shades].sort((left, right) => Number(left) - Number(right))
    );
  });

  return colorPrefixShades;
};

const COLOR_SHADE_PREFIXES = inferColorShadePrefixes(TAILWIND_CLASSES);

const pickPreferredShade = (shades: string[]) => {
  if (shades.includes('500')) return '500';
  if (shades.includes('400')) return '400';
  return shades[Math.floor(shades.length / 2)] ?? shades[0] ?? '500';
};

const isLengthHintEligiblePrefix = (prefix: string) =>
  ARBITRARY_LENGTH_PREFIXES.has(prefix) && !COLOR_SHADE_PREFIXES.has(prefix);

const isInvalidColorShadeLiteral = (utilityDraft: string) => {
  const draft = utilityDraft.trim().toLowerCase();
  if (!draft) return false;
  const invalidShadeMatch = draft.match(/^(.+)-(\d{1,4})([a-z%]+)$/);
  if (!invalidShadeMatch) return false;
  const prefix = invalidShadeMatch[1]?.trim();
  if (!prefix) return false;
  return COLOR_SHADE_PREFIXES.has(prefix);
};

const isArbitraryVariant = (value: string) => {
  const token = value.trim();
  if (!token) return false;
  if (token.startsWith('[') && token.endsWith(']')) return true;
  if (token.includes('-[') && token.endsWith(']')) return true;
  return false;
};

const toArbitraryLengthUtilitySuggestions = (
  utilityDraft: string
): ClassSuggestion[] => {
  const draft = utilityDraft.trim();
  if (!draft || draft.includes('(')) return [];

  const templateMatch = draft.match(/^(.*)-\[$/);
  if (templateMatch) {
    const prefix = templateMatch[1]?.trim();
    if (!prefix || !isLengthHintEligiblePrefix(prefix)) return [];
    return [
      {
        token: `${prefix}-[<length>]`,
        insertText: `${prefix}-[12px]`,
        kind: 'hint',
        hint: {
          type: 'arbitrary-length-template',
          prefix,
        },
        source: 'tailwind',
        score: 140,
      },
    ];
  }

  if (draft.endsWith('-')) {
    const prefix = draft.slice(0, -1);
    if (!isLengthHintEligiblePrefix(prefix)) return [];
    return [
      {
        token: `${prefix}-[<length>]`,
        insertText: `${prefix}-[12px]`,
        kind: 'hint',
        hint: {
          type: 'arbitrary-length-template',
          prefix,
        },
        source: 'tailwind',
        score: 139,
      },
    ];
  }

  const bracketValueMatch = draft.match(
    /^(.+)-\[(-?(?:\d+|\d*\.\d+)?)([a-z%]*)$/i
  );
  if (bracketValueMatch) {
    const prefix = bracketValueMatch[1]?.trim();
    const amount = bracketValueMatch[2] ?? '';
    const unitDraft = (bracketValueMatch[3] ?? '').toLowerCase();
    if (!prefix || !isLengthHintEligiblePrefix(prefix)) return [];
    if (!amount || !NUMERIC_LITERAL_PATTERN.test(amount)) return [];
    const unitCandidates = CSS_LENGTH_OR_PERCENTAGE_UNITS.filter((unit) =>
      unit.toLowerCase().startsWith(unitDraft)
    );
    return unitCandidates.map((unit, index) => ({
      token: `${prefix}-[${amount}${unit}]`,
      insertText: `${prefix}-[${amount}${unit}]`,
      source: 'tailwind' as const,
      score: unit.toLowerCase() === unitDraft ? 138 : 136 - index / 100,
    }));
  }

  const normalizedValueMatch = draft.match(
    /^(.+)-(-?(?:\d+|\d*\.\d+))([a-z%]+)$/i
  );
  if (!normalizedValueMatch) return [];
  const prefix = normalizedValueMatch[1]?.trim();
  const amount = normalizedValueMatch[2] ?? '';
  const unitDraft = (normalizedValueMatch[3] ?? '').toLowerCase();
  if (!prefix || !isLengthHintEligiblePrefix(prefix)) return [];
  if (!amount || !NUMERIC_LITERAL_PATTERN.test(amount)) return [];

  const unitCandidates = CSS_LENGTH_OR_PERCENTAGE_UNITS.filter((unit) =>
    unit.toLowerCase().startsWith(unitDraft)
  );
  if (!unitCandidates.length) return [];
  return unitCandidates.map((unit, index) => ({
    token: `${prefix}-[${amount}${unit}]`,
    insertText: `${prefix}-[${amount}${unit}]`,
    source: 'tailwind' as const,
    score: unit.toLowerCase() === unitDraft ? 137 : 135 - index / 100,
  }));
};

const normalizeScaleValue = (value: number) => {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(4).replace(/\.?0+$/, '');
};

const toScaleTokenFromPx = (amount: string) => {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return null;
  if (numeric === 1) return 'px';
  return normalizeScaleValue(numeric / DEFAULT_SPACING_BASE_PX);
};

const toScaleTokenSuggestions = (utilityDraft: string): ClassSuggestion[] => {
  const draft = utilityDraft.trim().toLowerCase();
  if (!draft) return [];

  const pxMatch =
    draft.match(/^(.+)-\[(-?(?:\d+|\d*\.\d+))px\]$/) ??
    draft.match(/^(.+)-(-?(?:\d+|\d*\.\d+))px$/);
  if (!pxMatch) return [];

  const prefix = pxMatch[1]?.trim();
  const amount = pxMatch[2] ?? '';
  if (!prefix || !amount || !ARBITRARY_LENGTH_PREFIXES.has(prefix)) return [];

  const scaleToken = toScaleTokenFromPx(amount);
  if (!scaleToken) return [];

  const supportedScaleTokens = SCALE_TOKENS_BY_PREFIX.get(prefix);
  if (!supportedScaleTokens?.has(scaleToken)) return [];

  const token = `${prefix}-${scaleToken}`;
  if (!TAILWIND_CLASSES.includes(token)) return [];

  return [
    {
      token,
      insertText: token,
      detail: `Inferred from ${amount}px using default ${DEFAULT_SPACING_BASE_PX}px scale`,
      source: 'tailwind',
      score: 118,
    },
  ];
};

const toColorShadeUtilitySuggestions = (utilityDraft: string) => {
  const draft = utilityDraft.trim().toLowerCase();
  if (!draft) return [];

  if (draft.endsWith('-')) {
    const prefix = draft.slice(0, -1);
    const shades = COLOR_SHADE_PREFIXES.get(prefix);
    if (!shades?.length) return [];
    const preferredShade = pickPreferredShade(shades);
    return [
      {
        token: `${prefix}-<shade>`,
        insertText: `${prefix}-${preferredShade}`,
        kind: 'hint' as const,
        hint: {
          type: 'color-shade-template' as const,
          prefix,
          example: `${prefix}-${preferredShade}`,
        },
        source: 'tailwind' as const,
        score: 141,
      },
    ];
  }

  const shadeDraftMatch = draft.match(/^(.+)-(\d{0,4})$/);
  if (!shadeDraftMatch) return [];
  const prefix = shadeDraftMatch[1]?.trim();
  const shadeDraft = shadeDraftMatch[2] ?? '';
  if (!prefix) return [];
  const shades = COLOR_SHADE_PREFIXES.get(prefix);
  if (!shades?.length) return [];
  const matchedShades = shades.filter((shade) => shade.startsWith(shadeDraft));
  return matchedShades.map((shade, index) => ({
    token: `${prefix}-${shade}`,
    insertText: `${prefix}-${shade}`,
    source: 'tailwind' as const,
    score: 140 - index / 100,
  }));
};

const rankTailwindToken = (
  token: string,
  query: string,
  tokens: Set<string>,
  hasFlex: boolean,
  hasGrid: boolean
) => {
  if (tokens.has(token)) return -1;
  const lowerToken = token.toLowerCase();
  const lowerQuery = query.toLowerCase();

  let score = 0;
  if (!query) score += 8;
  if (lowerToken === lowerQuery) score += 120;
  else if (lowerToken.startsWith(lowerQuery)) score += 100;
  else if (lowerToken.includes(lowerQuery)) score += 70;
  else return -1;

  if (
    hasFlex &&
    (token.startsWith('flex-') ||
      token.startsWith('items-') ||
      token.startsWith('justify-'))
  ) {
    score += 25;
  }
  if (hasGrid && token.startsWith('grid-')) score += 25;
  if (
    token.startsWith('p-') ||
    token.startsWith('m-') ||
    token.startsWith('gap-')
  ) {
    score += 8;
  }
  return score;
};

const rankTailwindTokenFuzzy = (
  token: string,
  query: string,
  tokens: Set<string>
) => {
  if (tokens.has(token)) return -1;
  if (!query) return -1;
  const normalizedToken = normalizeForFuzzyMatch(token);
  const normalizedQuery = normalizeForFuzzyMatch(query);
  if (!normalizedQuery) return -1;
  if (normalizedToken === normalizedQuery) return 52;
  if (normalizedToken.startsWith(normalizedQuery)) return 44;
  if (normalizedToken.includes(normalizedQuery)) return 32;
  return -1;
};

const isSubsequenceMatch = (value: string, query: string) => {
  let cursor = 0;
  for (
    let index = 0;
    index < value.length && cursor < query.length;
    index += 1
  ) {
    if (value[index] === query[cursor]) {
      cursor += 1;
    }
  }
  return cursor === query.length;
};

const rankTailwindTokenAbbreviation = (
  token: string,
  query: string,
  tokens: Set<string>
) => {
  if (tokens.has(token)) return -1;
  const normalizedQuery = normalizeForFuzzyMatch(query);
  if (!normalizedQuery || normalizedQuery.length < 2) return -1;

  const segments = splitUtilitySegments(token);
  if (!segments.length) return -1;
  const initials = segments.map((segment) => segment[0]).join('');
  const compressed = `${segments[0]?.[0] ?? ''}${segments.slice(1).join('')}`;
  const normalizedToken = normalizeForFuzzyMatch(token);

  if (compressed === normalizedQuery) return 38;
  if (initials === normalizedQuery) return 34;
  if (compressed.startsWith(normalizedQuery)) return 30;
  if (initials.startsWith(normalizedQuery)) return 28;
  if (isSubsequenceMatch(normalizedToken, normalizedQuery)) return 18;
  return -1;
};

const toVariantSuggestions = (
  query: string,
  tokens: Set<string>,
  limit: number
): ClassSuggestion[] => {
  const parsed = parseTailwindSuggestionQuery(query);
  if (!parsed.hasTopLevelColon && !parsed.variantDraft) return [];

  const hasVariantDraft = Boolean(parsed.variantDraft);
  const variantDraft = parsed.variantDraft.toLowerCase();
  const variantCompletionSuggestions: ClassSuggestion[] = hasVariantDraft
    ? TAILWIND_VARIANTS.filter(
        (variant) =>
          variant.toLowerCase().startsWith(variantDraft) ||
          variantDraft.startsWith(variant.toLowerCase())
      )
        .map((variant) => ({
          token: `${[...parsed.fixedVariants, variant].join(':')}:`,
          source: 'tailwind' as const,
          score: variant === parsed.variantDraft ? 95 : 80,
        }))
        .filter((candidate) => !tokens.has(candidate.token))
    : [];

  const resolvedVariantChain =
    parsed.variantDraft &&
    (TAILWIND_VARIANTS.includes(parsed.variantDraft) ||
      isArbitraryVariant(parsed.variantDraft))
      ? [...parsed.fixedVariants, parsed.variantDraft]
      : parsed.fixedVariants;
  if (!resolvedVariantChain.length) {
    return variantCompletionSuggestions.slice(0, limit);
  }

  const utilityCandidates = TAILWIND_CLASSES.filter((utility) => {
    if (!parsed.utilityDraft) return true;
    return utility.includes(parsed.utilityDraft);
  }).slice(0, limit * 4);

  const utilitySuggestions = utilityCandidates
    .map((utility) => {
      const token = `${resolvedVariantChain.join(':')}:${utility}`;
      if (tokens.has(token)) return null;
      const score =
        60 +
        (utility.startsWith(parsed.utilityDraft) ? 40 : 20) +
        (parsed.utilityDraft ? 0 : 10);
      return { token, source: 'tailwind' as const, score };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const arbitraryLengthSuggestions = toArbitraryLengthUtilitySuggestions(
    parsed.utilityDraft
  ).flatMap((suggestion) => {
    const token = `${resolvedVariantChain.join(':')}:${suggestion.token}`;
    const insertText = suggestion.insertText
      ? `${resolvedVariantChain.join(':')}:${suggestion.insertText}`
      : token;
    if (tokens.has(insertText)) return [];
    return [
      {
        ...suggestion,
        token,
        insertText,
      },
    ];
  });

  if (isArbitraryTailwindToken(parsed.utilityDraft)) {
    const token = `${resolvedVariantChain.join(':')}:${parsed.utilityDraft}`;
    if (!tokens.has(token)) {
      utilitySuggestions.push({
        token,
        source: 'tailwind',
        score: 120,
      });
    }
  }

  return [
    ...variantCompletionSuggestions,
    ...arbitraryLengthSuggestions,
    ...utilitySuggestions,
  ]
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
};

export const tailwind4ClassEngine: ClassProtocolEngine = {
  tokenize: (input) => parseClassProtocolTokens(input, 'tailwind'),
  suggest: ({ query, tokens, limit }) => {
    const tokenSet = new Set(tokens);
    const hasFlex = tokenSet.has('flex');
    const hasGrid = tokenSet.has('grid');
    const baseSuggestions: ClassSuggestion[] = [];
    const trimmedQuery = query.trim();
    if (isInvalidColorShadeLiteral(trimmedQuery)) return [];

    for (const token of TAILWIND_CLASSES) {
      const score = rankTailwindToken(
        token,
        trimmedQuery,
        tokenSet,
        hasFlex,
        hasGrid
      );
      if (score < 0) continue;
      baseSuggestions.push({ token, source: 'tailwind', score });
    }

    if (isArbitraryTailwindToken(trimmedQuery) && !tokenSet.has(trimmedQuery)) {
      baseSuggestions.push({
        token: trimmedQuery,
        source: 'tailwind',
        score: 130,
      });
    }

    toArbitraryLengthUtilitySuggestions(trimmedQuery).forEach((suggestion) => {
      const insertText = suggestion.insertText ?? suggestion.token;
      if (tokenSet.has(insertText)) return;
      baseSuggestions.push(suggestion);
    });
    toScaleTokenSuggestions(trimmedQuery).forEach((suggestion) => {
      const insertText = suggestion.insertText ?? suggestion.token;
      if (tokenSet.has(insertText)) return;
      baseSuggestions.push(suggestion);
    });
    toColorShadeUtilitySuggestions(trimmedQuery).forEach((suggestion) => {
      const insertText = suggestion.insertText ?? suggestion.token;
      if (tokenSet.has(insertText)) return;
      baseSuggestions.push(suggestion);
    });

    const variantSuggestions = toVariantSuggestions(
      trimmedQuery,
      tokenSet,
      limit
    );
    const commonVariantSuggestions =
      trimmedQuery && !trimmedQuery.includes(':')
        ? COMMON_VARIANTS.filter((variant) =>
            variant.startsWith(trimmedQuery.toLowerCase())
          ).map((variant) => ({
            token: `${variant}:`,
            source: 'tailwind' as const,
            score: 40,
          }))
        : [];

    const merged = [
      ...variantSuggestions,
      ...baseSuggestions,
      ...commonVariantSuggestions,
    ].sort((left, right) => right.score - left.score);

    if (!merged.length && trimmedQuery) {
      const fallbackRankers = [
        rankTailwindTokenFuzzy,
        rankTailwindTokenAbbreviation,
      ];
      for (const ranker of fallbackRankers) {
        const fallback: ClassSuggestion[] = [];
        for (const token of TAILWIND_CLASSES) {
          const score = ranker(token, trimmedQuery, tokenSet);
          if (score < 0) continue;
          fallback.push({ token, source: 'tailwind', score });
        }
        if (fallback.length) {
          return fallback
            .sort((left, right) => right.score - left.score)
            .slice(0, limit);
        }
      }
    }

    return merged.slice(0, limit);
  },
  resolveConflict: (tokens) =>
    twMerge(tokens.join(' ')).split(/\s+/).filter(Boolean),
};
