import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ExternalLink,
  LayoutGrid,
  PenLine,
  Sparkles,
  Tags,
  Type,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { classProtocolEngine } from './engineRegistry';
import { resolveClassTokenColorSwatch } from './colorSwatch';
import type { MountedCssEntry } from './mountedCss';
import { resolveMountedCssTokenTarget } from './mountedCss';
import type { ClassSuggestion } from './types';
import { useClassProtocolModeState } from './useClassProtocolModeState';
import { parseClassTokens, toClassNameValue } from './tokenizer';
import { useSettingsStore } from '@/editor/store/useSettingsStore';

type ClassProtocolEditorProps = {
  projectId?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputTestId?: string;
  mountedCssEntries?: MountedCssEntry[];
  onOpenMountedCss?: (target: {
    path: string;
    className: string;
    line?: number;
    column?: number;
  }) => void;
};

const getSuggestionIcon = (suggestion: ClassSuggestion) => {
  if (suggestion.source === 'mounted-css') return ExternalLink;
  const token = suggestion.token;
  if (token.startsWith('text-') || token.startsWith('font-')) return Type;
  if (
    token.startsWith('grid') ||
    token.startsWith('flex') ||
    token.startsWith('items-') ||
    token.startsWith('justify-')
  ) {
    return LayoutGrid;
  }
  return Sparkles;
};

const normalizeSuggestionQuery = (value: string) => value.trim().toLowerCase();

const toMountedCssSuggestions = (
  entries: MountedCssEntry[],
  query: string,
  tokens: string[],
  limit: number
): ClassSuggestion[] => {
  const normalizedQuery = normalizeSuggestionQuery(query);
  const activeTokens = new Set(tokens);
  const byClassName = new Map<string, ClassSuggestion>();

  entries.forEach((entry) => {
    entry.classes.forEach((className) => {
      if (!className || activeTokens.has(className)) return;
      const normalizedClassName = className.toLowerCase();
      if (
        normalizedQuery &&
        !normalizedClassName.startsWith(normalizedQuery) &&
        !normalizedClassName.includes(normalizedQuery)
      ) {
        return;
      }
      const score =
        normalizedClassName === normalizedQuery
          ? 240
          : normalizedClassName.startsWith(normalizedQuery)
            ? 220
            : 190;
      const current = byClassName.get(className);
      if (current && current.score >= score) return;
      byClassName.set(className, {
        token: className,
        label: className,
        detail: entry.path,
        source: 'mounted-css',
        score,
      });
    });
  });

  return [...byClassName.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
};

export function ClassProtocolEditor({
  projectId,
  value,
  onChange,
  placeholder,
  inputTestId,
  mountedCssEntries = [],
  onOpenMountedCss,
}: ClassProtocolEditorProps) {
  const { t } = useTranslation('blueprint');
  const [draft, setDraft] = useState('');
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const { mode, inlineDraft, nextMode, setMode, setInlineDraft } =
    useClassProtocolModeState(value);
  const draftInputRef = useRef<HTMLInputElement | null>(null);
  const inlineTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const tokens = useMemo(() => parseClassTokens(value), [value]);
  const resolveOverrideTarget = (index: number) => {
    const source = tokens[index];
    if (!source) return undefined;
    for (let pointer = index + 1; pointer < tokens.length; pointer += 1) {
      const candidate = tokens[pointer];
      if (!candidate) continue;
      const mergedPair = classProtocolEngine.resolveConflict([
        source,
        candidate,
      ]);
      if (mergedPair.includes(candidate) && !mergedPair.includes(source)) {
        return candidate;
      }
    }
    return undefined;
  };
  const retainedTokenIndexes = useMemo(() => {
    const resolved = classProtocolEngine.resolveConflict(tokens);
    const retained = new Set<number>();
    let resolvedIndex = resolved.length - 1;
    for (let index = tokens.length - 1; index >= 0; index -= 1) {
      if (resolvedIndex < 0) break;
      if (tokens[index] !== resolved[resolvedIndex]) continue;
      retained.add(index);
      resolvedIndex -= 1;
    }
    return retained;
  }, [tokens]);
  const classPxTransformMode = useSettingsStore((state) =>
    state.getEffectiveGlobalValue(projectId, 'classPxTransformMode')
  );
  const preferScaleToken = classPxTransformMode === 'prefer-scale-token';
  const engineSuggestions = useMemo(
    () =>
      classProtocolEngine.suggest({
        query: draft,
        tokens,
        limit: 48,
      }),
    [draft, tokens]
  );
  const mountedCssSuggestions = useMemo(
    () => toMountedCssSuggestions(mountedCssEntries, draft, tokens, 48),
    [draft, mountedCssEntries, tokens]
  );
  const suggestions = useMemo(() => {
    const mergedSuggestions = [
      ...mountedCssSuggestions,
      ...engineSuggestions,
    ].reduce<ClassSuggestion[]>((result, suggestion) => {
      const key = suggestion.insertText ?? suggestion.token;
      const index = result.findIndex(
        (item) => (item.insertText ?? item.token) === key
      );
      if (index < 0) {
        result.push(suggestion);
        return result;
      }
      if ((result[index]?.score ?? 0) < suggestion.score) {
        result[index] = suggestion;
      }
      return result;
    }, []);

    const sortedSuggestions = mergedSuggestions.sort(
      (left, right) => right.score - left.score
    );

    if (!preferScaleToken) return sortedSuggestions;

    const inferredIndex = sortedSuggestions.findIndex((item) =>
      item.detail?.startsWith('Inferred from ')
    );
    if (inferredIndex <= 0) return sortedSuggestions;

    const inferred = sortedSuggestions[inferredIndex];
    if (!inferred) return sortedSuggestions;
    const next = [...sortedSuggestions];
    next.splice(inferredIndex, 1);
    next.unshift(inferred);
    return next;
  }, [engineSuggestions, mountedCssSuggestions, preferScaleToken]);

  const getSuggestionLabel = (suggestion: ClassSuggestion) => {
    if (suggestion.kind === 'hint' && suggestion.hint) {
      if (suggestion.hint.type === 'arbitrary-length-template') {
        const templateText = t(
          'inspector.fields.className.templates.lengthWithUnit',
          {
            defaultValue: 'length with unit',
          }
        );
        return `${suggestion.hint.prefix}-[${templateText}]`;
      }
      if (suggestion.hint.type === 'color-shade-template') {
        const templateText = t(
          'inspector.fields.className.templates.colorShade',
          {
            defaultValue: 'color shade',
          }
        );
        return `${suggestion.hint.prefix}-[${templateText}]`;
      }
    }
    return suggestion.label ?? suggestion.token;
  };

  const getSuggestionDetail = (suggestion: ClassSuggestion) => {
    if (suggestion.kind === 'hint' && suggestion.hint) {
      if (suggestion.hint.type === 'arbitrary-length-template') {
        const exampleA = `${suggestion.hint.prefix}-[12px]`;
        const exampleB = `${suggestion.hint.prefix}-[1rem]`;
        return t('inspector.fields.className.hints.arbitraryLengthTemplate', {
          defaultValue: `Example: ${exampleA}, ${exampleB}`,
          exampleA,
          exampleB,
        });
      }
      if (suggestion.hint.type === 'color-shade-template') {
        const example = suggestion.hint.example;
        return t('inspector.fields.className.hints.colorShade', {
          defaultValue: `Example: ${example}`,
          example,
        });
      }
    }
    const inferredFromScaleMatch = suggestion.detail?.match(
      /^Inferred from (-?(?:\d+|\d*\.\d+))px using default (-?(?:\d+|\d*\.\d+))px scale$/
    );
    if (inferredFromScaleMatch) {
      const amount = inferredFromScaleMatch[1];
      const base = inferredFromScaleMatch[2];
      return t('inspector.fields.className.hints.inferredFromScale', {
        defaultValue: `Inferred from ${amount}px using default ${base}px scale`,
        amount,
        base,
      });
    }
    return suggestion.detail;
  };

  useEffect(() => {
    setActiveSuggestionIndex(0);
  }, [draft, suggestions.length]);

  useEffect(() => {
    if (mode !== 'inline') return;
    const textarea = inlineTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(textarea.scrollHeight, 32)}px`;
  }, [mode, inlineDraft]);

  const emitTokens = (nextTokens: string[]) => {
    onChange(toClassNameValue(nextTokens));
  };
  const nextModeLabel =
    nextMode === 'token'
      ? t('inspector.fields.className.modes.token', {
          defaultValue: 'token',
        })
      : t('inspector.fields.className.modes.inline', {
          defaultValue: 'inline',
        });

  const commitToken = (rawToken: string) => {
    const token = rawToken.trim();
    if (!token) return;
    emitTokens([...tokens, token]);
    setDraft('');
  };

  const commitMany = (rawInput: string) => {
    const nextTokens = parseClassTokens(rawInput);
    if (!nextTokens.length) return;
    emitTokens([...tokens, ...nextTokens]);
    setDraft('');
  };

  const removeTokenAt = (index: number) => {
    emitTokens(tokens.filter((_, current) => current !== index));
  };

  const rollbackTokenToDraft = (index: number) => {
    const token = tokens[index];
    if (!token) return;
    emitTokens(tokens.filter((_, current) => current !== index));
    setDraft(token);
    requestAnimationFrame(() => {
      const input = draftInputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(token.length, token.length);
    });
  };

  const ModeIcon = mode === 'token' ? Tags : PenLine;

  const tokenEditor = (
    <div className="InspectorClassProtocol relative grid w-full gap-1.5">
      <div className="flex min-h-8 flex-wrap items-center gap-1.5 rounded-md border border-(--border-default) px-1.5 py-1 pr-7">
        {tokens.map((token, index) => {
          const tokenSwatch = resolveClassTokenColorSwatch(token);
          const mountedCssTarget = resolveMountedCssTokenTarget(
            mountedCssEntries,
            token
          );
          const isOverridden = !retainedTokenIndexes.has(index);
          const overriddenBy = isOverridden
            ? resolveOverrideTarget(index)
            : undefined;
          return (
            <span
              key={`${token}-${index}`}
              className={`inline-flex min-h-6 items-center gap-1 rounded-md border border-(--border-default) bg-(--bg-raised) py-[2px] pr-1 pl-1.5 text-[11px] leading-[1.25] text-(--text-secondary) ${
                isOverridden ? 'opacity-60' : ''
              }`}
              onDoubleClick={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest('button')) return;
                event.preventDefault();
                rollbackTokenToDraft(index);
              }}
              data-testid={
                isOverridden
                  ? `inspector-classname-token-overridden-${index}`
                  : `inspector-classname-token-${index}`
              }
              title={
                isOverridden
                  ? overriddenBy
                    ? t('inspector.fields.className.overriddenBy', {
                        defaultValue: `Overridden by "${overriddenBy}"`,
                        token: overriddenBy,
                      })
                    : t('inspector.fields.className.overriddenByUnknown', {
                        defaultValue: 'Overridden by another class',
                      })
                  : undefined
              }
            >
              {tokenSwatch ? (
                <span
                  className={`inline-flex h-1.5 w-1.5 shrink-0 rounded-full ${
                    tokenSwatch.kind === 'background'
                      ? 'ring-[1px] ring-(--border-strong)'
                      : ''
                  } ${
                    tokenSwatch.kind === 'border'
                      ? 'bg-transparent ring-[1px] ring-current'
                      : ''
                  } ${tokenSwatch.kind === 'vector' ? 'rounded-[2px]' : ''}`}
                  style={{
                    backgroundColor:
                      tokenSwatch.kind === 'border'
                        ? 'transparent'
                        : tokenSwatch.color,
                    color: tokenSwatch.color,
                  }}
                  data-testid={`inspector-classname-color-dot-${index}`}
                  data-color-kind={tokenSwatch.kind}
                  aria-hidden="true"
                />
              ) : null}
              <span className="inline-flex max-w-32 flex-col leading-[1.25]">
                <span className="relative truncate">
                  {token}
                  {isOverridden ? (
                    <span
                      className="pointer-events-none absolute top-1/2 right-0 left-0 h-px -translate-y-1/2 bg-current/50"
                      aria-hidden="true"
                    />
                  ) : null}
                </span>
              </span>
              {mountedCssTarget ? (
                <button
                  type="button"
                  className="inline-flex h-4 w-4 items-center justify-center rounded-sm border-0 bg-transparent p-0 text-(--text-muted) hover:text-(--text-primary)"
                  onClick={() =>
                    onOpenMountedCss?.({
                      path: mountedCssTarget.path,
                      className: token,
                      line: mountedCssTarget.line,
                      column: mountedCssTarget.column,
                    })
                  }
                  data-testid={`inspector-classname-open-mounted-css-${index}`}
                  aria-label={t(
                    'inspector.fields.className.actions.openMountedCssFor',
                    {
                      defaultValue: `Open mounted CSS for ${token}`,
                      token,
                    }
                  )}
                  title={t(
                    'inspector.fields.className.actions.openMountedCssPath',
                    {
                      defaultValue: `Open mounted CSS (${mountedCssTarget.path})`,
                      path: mountedCssTarget.path,
                    }
                  )}
                >
                  <ExternalLink size={11} />
                </button>
              ) : null}
              <button
                type="button"
                className="inline-flex h-4 w-4 items-center justify-center rounded-sm border-0 bg-transparent p-0 text-(--text-muted) hover:text-(--text-primary)"
                onClick={() => removeTokenAt(index)}
                data-testid={`inspector-classname-token-remove-${index}`}
                aria-label={t(
                  'inspector.fields.className.actions.removeToken',
                  {
                    defaultValue: `Remove ${token}`,
                    token,
                  }
                )}
              >
                <X size={12} />
              </button>
            </span>
          );
        })}
        <input
          ref={draftInputRef}
          className="h-6 min-w-24 flex-1 border-0 bg-transparent px-1 text-xs text-(--text-primary) outline-none placeholder:text-(--text-muted)"
          value={draft}
          onChange={(event) => {
            const nextValue = event.target.value;
            if (/\s/.test(nextValue.trim())) {
              commitMany(nextValue);
              return;
            }
            setDraft(nextValue);
          }}
          onBlur={() => commitToken(draft)}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData('text');
            if (!pasted.trim()) return;
            event.preventDefault();
            commitMany(pasted);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              if (!suggestions.length) return;
              setActiveSuggestionIndex((current) =>
                current >= suggestions.length - 1 ? 0 : current + 1
              );
              return;
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              if (!suggestions.length) return;
              setActiveSuggestionIndex((current) =>
                current <= 0 ? suggestions.length - 1 : current - 1
              );
              return;
            }
            if (
              event.key === 'Enter' ||
              event.key === 'Tab' ||
              event.key === ','
            ) {
              if (!draft.trim()) return;
              event.preventDefault();
              const picked = suggestions[activeSuggestionIndex];
              if (picked?.kind === 'hint') {
                setDraft(picked.insertText ?? picked.token);
                return;
              }
              commitToken(picked?.insertText ?? picked?.token ?? draft);
              return;
            }
            if (event.key === 'Backspace' && !draft && !event.repeat) {
              if (!tokens.length) return;
              event.preventDefault();
              removeTokenAt(tokens.length - 1);
            }
          }}
          placeholder={placeholder}
          data-testid={inputTestId}
        />
        <button
          type="button"
          className="absolute top-1.5 right-1.5 inline-flex h-5 w-5 items-center justify-center rounded-md border-0 bg-transparent text-(--text-muted) hover:text-(--text-primary)"
          onClick={() => setMode(nextMode)}
          data-testid="inspector-classname-mode-toggle"
          aria-label={t('inspector.fields.className.actions.switchMode', {
            defaultValue: `Switch to ${nextModeLabel} mode`,
            mode: nextModeLabel,
          })}
          title={t('inspector.fields.className.actions.switchMode', {
            defaultValue: `Switch to ${nextModeLabel} mode`,
            mode: nextModeLabel,
          })}
        >
          <ModeIcon size={12} />
        </button>
      </div>
      {draft.trim() && suggestions.length ? (
        <div
          className="absolute top-[calc(100%+2px)] right-0 left-0 z-20 grid max-h-56 gap-0.5 overflow-y-auto rounded-md border border-(--border-default) bg-(--bg-canvas) p-1 shadow-(--shadow-md) [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar]:w-0"
          role="listbox"
          data-testid="inspector-classname-suggestions"
        >
          {suggestions.map((suggestion, index) => {
            const Icon = getSuggestionIcon(suggestion);
            return (
              <button
                key={suggestion.token}
                type="button"
                className={`flex min-h-6 items-center gap-1.5 rounded-md border-0 px-2 py-0.5 text-left text-xs leading-[1.25] ${
                  activeSuggestionIndex === index
                    ? 'bg-(--bg-raised) text-(--text-primary)'
                    : 'bg-transparent text-(--text-muted) hover:bg-(--bg-raised) hover:text-(--text-primary)'
                }`}
                role="option"
                aria-selected={activeSuggestionIndex === index}
                onMouseDown={(event) => {
                  event.preventDefault();
                  if (suggestion.kind === 'hint') {
                    setDraft(suggestion.insertText ?? suggestion.token);
                    return;
                  }
                  commitToken(suggestion.insertText ?? suggestion.token);
                }}
                data-testid={`inspector-classname-suggestion-${suggestion.token}`}
                title={getSuggestionDetail(suggestion)}
              >
                <Icon size={12} />
                <span className="truncate">
                  {getSuggestionLabel(suggestion)}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="grid w-full gap-1">
      {mode === 'token' ? (
        tokenEditor
      ) : (
        <div className="relative w-full">
          <textarea
            ref={inlineTextareaRef}
            className="min-h-8 w-full min-w-0 resize-none overflow-hidden rounded-md border border-(--border-default) bg-transparent px-2 py-1 pr-7 text-xs leading-[1.35] text-(--text-primary) outline-none placeholder:text-(--text-muted)"
            rows={2}
            value={inlineDraft}
            onChange={(event) => {
              const nextRawValue = event.target.value;
              setInlineDraft(nextRawValue);
              onChange(toClassNameValue(parseClassTokens(nextRawValue)));
            }}
            placeholder={placeholder}
            data-testid={inputTestId}
          />
          <button
            type="button"
            className="absolute top-1 right-1 inline-flex h-5 w-5 items-center justify-center rounded-md border-0 bg-transparent text-(--text-muted) hover:text-(--text-primary)"
            onClick={() => setMode(nextMode)}
            data-testid="inspector-classname-mode-toggle"
            aria-label={t('inspector.fields.className.actions.switchMode', {
              defaultValue: `Switch to ${nextModeLabel} mode`,
              mode: nextModeLabel,
            })}
            title={t('inspector.fields.className.actions.switchMode', {
              defaultValue: `Switch to ${nextModeLabel} mode`,
              mode: nextModeLabel,
            })}
          >
            <ModeIcon size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
