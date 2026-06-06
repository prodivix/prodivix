import { apiRequest } from '@/infra/api';

export type CommunityResourceType = 'project' | 'component' | 'nodegraph';

export type CommunityProjectSummary = {
  id: string;
  resourceType: CommunityResourceType;
  name: string;
  description: string;
  authorId: string;
  authorName: string;
  starsCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CommunityProjectDetail = {
  id: string;
  ownerId: string;
  resourceType: CommunityResourceType;
  name: string;
  description: string;
  pir: unknown;
  isPublic: boolean;
  starsCount: number;
  createdAt: string;
  updatedAt: string;
  authorName: string;
};

type ListProjectsOptions = {
  keyword?: string;
  resourceType?: CommunityResourceType | 'all';
  sort?: 'latest' | 'popular';
  page?: number;
  pageSize?: number;
};

const JSON_HEADERS = {
  'Content-Type': 'application/json',
} as const;

const request = async <T>(
  path: string,
  options: RequestInit = {}
): Promise<T> =>
  apiRequest<T>(path, {
    ...options,
    defaultHeaders: JSON_HEADERS,
  });

const buildListQuery = (options: ListProjectsOptions) => {
  const params = new URLSearchParams();
  if (options.keyword?.trim()) {
    params.set('keyword', options.keyword.trim());
  }
  if (options.resourceType && options.resourceType !== 'all') {
    params.set('resourceType', options.resourceType);
  }
  if (options.sort) {
    params.set('sort', options.sort);
  }
  if (typeof options.page === 'number' && options.page > 0) {
    params.set('page', String(options.page));
  }
  if (typeof options.pageSize === 'number' && options.pageSize > 0) {
    params.set('pageSize', String(options.pageSize));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
};

export const communityApi = {
  listProjects: async (
    options: ListProjectsOptions = {},
    requestOptions: RequestInit = {}
  ) =>
    request<{
      projects: CommunityProjectSummary[];
      page: number;
      pageSize: number;
      sort: 'latest' | 'popular' | string;
    }>(`/community/projects${buildListQuery(options)}`, requestOptions),

  getProject: async (projectId: string, options: RequestInit = {}) =>
    request<{ project: CommunityProjectDetail }>(
      `/community/projects/${encodeURIComponent(projectId)}`,
      options
    ),
};
