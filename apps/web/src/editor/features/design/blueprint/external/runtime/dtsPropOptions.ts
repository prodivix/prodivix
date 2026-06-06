import type {
  CanonicalExternalComponent,
  ExternalLibraryDescriptor,
} from './types';
import { isAbortError } from '@/infra/api';

const PROP_KEYS = ['category', 'type', 'variant', 'color', 'severity', 'size'];
const fetchCache = new Map<string, Promise<string | null>>();
const DTS_CACHE_PREFIX = 'prodivix.external.dts.';
const DTS_CACHE_TTL_MS = 1000 * 60 * 60 * 24;

export const createDtsCacheKey = (url: string) => `${DTS_CACHE_PREFIX}${url}`;

const readDtsCache = (url: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(createDtsCacheKey(url));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { content?: string; cachedAt?: number };
    if (
      typeof parsed.content !== 'string' ||
      typeof parsed.cachedAt !== 'number' ||
      Date.now() - parsed.cachedAt > DTS_CACHE_TTL_MS
    ) {
      window.localStorage.removeItem(createDtsCacheKey(url));
      return null;
    }
    return parsed.content;
  } catch {
    return null;
  }
};

const writeDtsCache = (url: string, content: string) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      createDtsCacheKey(url),
      JSON.stringify({ content, cachedAt: Date.now() })
    );
  } catch {
    // ignore storage write failures
  }
};

const fetchText = async (
  url: string,
  signal?: AbortSignal
): Promise<string | null> => {
  if (fetchCache.has(url)) return fetchCache.get(url)!;
  const cached = readDtsCache(url);
  if (cached) {
    const cachedPromise = Promise.resolve(cached);
    fetchCache.set(url, cachedPromise);
    return cachedPromise;
  }
  const promise = (async () => {
    try {
      const response = await fetch(url, { credentials: 'omit', signal });
      if (!response.ok) return null;
      const content = await response.text();
      if (content) writeDtsCache(url, content);
      return content;
    } catch (error) {
      if (isAbortError(error)) {
        fetchCache.delete(url);
      }
      return null;
    }
  })();
  fetchCache.set(url, promise);
  return promise;
};

const extractQuotedOptions = (source: string) => {
  const matches = source.match(/'([^']+)'/g) ?? [];
  return [...new Set(matches.map((value) => value.slice(1, -1)))];
};

const parseTypeAliasUnion = (dts: string, typeName: string) => {
  const aliasMatch = dts.match(
    new RegExp(`type\\s+${typeName}\\s*=\\s*([\\s\\S]{0,300}?);`)
  );
  if (!aliasMatch) return [];
  return extractQuotedOptions(aliasMatch[1] ?? '');
};

const parsePropOptionsFromDts = (dts: string, propName: string) => {
  const propMatch = dts.match(
    new RegExp(`${propName}\\??:\\s*([\\s\\S]{0,220}?);`)
  );
  if (!propMatch) return [];
  const propType = (propMatch[1] ?? '').trim();
  const quoted = extractQuotedOptions(propType);
  if (quoted.length > 0) return quoted;
  const aliasMatch = propType.match(/\b([A-Z][A-Za-z0-9_]*)\b/);
  if (!aliasMatch) return [];
  return parseTypeAliasUnion(dts, aliasMatch[1]);
};

const toKebabCaseSegment = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();

const toAntdPathCandidates = (componentPath: string) => {
  const base = componentPath.split('.')[0];
  const directory = toKebabCaseSegment(base);
  return [`${directory}/index.d.ts`, `${directory}/${base}.d.ts`];
};

const resolveDtsUrls = (
  descriptor: ExternalLibraryDescriptor,
  componentPath: string
) => {
  const packageName = descriptor.packageName;
  const version = descriptor.version;
  if (packageName === '@mui/material') {
    const base = componentPath.split('.')[0];
    return [
      `https://cdn.jsdelivr.net/npm/@mui/material@${version}/${base}/${base}.d.ts`,
    ];
  }
  if (packageName === 'antd') {
    const paths = toAntdPathCandidates(componentPath);
    return paths.map(
      (path) => `https://cdn.jsdelivr.net/npm/antd@${version}/es/${path}`
    );
  }
  return [];
};

const inferPropOptionsFromDts = async (
  descriptor: ExternalLibraryDescriptor,
  component: CanonicalExternalComponent,
  signal?: AbortSignal
) => {
  const urls = resolveDtsUrls(descriptor, component.path);
  if (urls.length === 0) return {};
  let dts: string | null = null;
  for (const url of urls) {
    dts = await fetchText(url, signal);
    if (dts) break;
  }
  if (!dts) return {};
  const options: Record<string, string[]> = {};
  PROP_KEYS.forEach((key) => {
    const values = parsePropOptionsFromDts(dts!, key);
    if (values.length > 1) {
      options[key] = values;
    }
  });
  return options;
};

export const enrichCanonicalPropOptionsFromDts = async (
  descriptor: ExternalLibraryDescriptor,
  components: CanonicalExternalComponent[],
  options: { signal?: AbortSignal } = {}
) => {
  const enriched = await Promise.all(
    components.map(async (component) => {
      const propOptions = await inferPropOptionsFromDts(
        descriptor,
        component,
        options.signal
      );
      if (Object.keys(propOptions).length === 0) return component;
      return {
        ...component,
        propOptions: {
          ...(component.propOptions ?? {}),
          ...propOptions,
        },
      } satisfies CanonicalExternalComponent;
    })
  );
  return enriched;
};
