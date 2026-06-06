import type { ProdivixAiFetch } from './openAICompatibleProvider';

export interface DiscoverOpenAICompatibleModelsOptions {
  baseURL: string;
  apiKey?: string;
  fetcher: ProdivixAiFetch;
}

export interface ProdivixAiDiscoveredModel {
  id: string;
  ownedBy?: string;
  createdAt?: number;
  raw: unknown;
}

const normalizeBaseURL = (baseURL: string) => baseURL.replace(/\/+$/, '');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeModel = (value: unknown): ProdivixAiDiscoveredModel | null => {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  return {
    id: value.id,
    ownedBy: typeof value.owned_by === 'string' ? value.owned_by : undefined,
    createdAt: typeof value.created === 'number' ? value.created : undefined,
    raw: value,
  };
};

const readModelList = (body: unknown): readonly unknown[] => {
  if (!isRecord(body)) return [];
  if (Array.isArray(body.data)) return body.data;
  if (Array.isArray(body.models)) return body.models;
  return [];
};

export const discoverOpenAICompatibleModels = async ({
  baseURL,
  apiKey,
  fetcher,
}: DiscoverOpenAICompatibleModelsOptions): Promise<
  readonly ProdivixAiDiscoveredModel[]
> => {
  const response = await fetcher(`${normalizeBaseURL(baseURL)}/models`, {
    method: 'GET',
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : null),
    },
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI-compatible model discovery failed: ${response.status} ${response.statusText}`
    );
  }

  const body = await response.json();
  return readModelList(body)
    .map(normalizeModel)
    .filter((model): model is ProdivixAiDiscoveredModel => model !== null);
};
