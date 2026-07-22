import { Suspense, lazy, type ComponentType, type ReactNode } from 'react';
import type { i18n } from 'i18next';
import { Navigate } from 'react-router';
import './App.scss';
import Home from './home/Home';
import { loadAppNamespaces, type AppNamespace } from './i18n';

const routeFallback = (
  <div className="px-4 py-3 text-xs text-(--text-secondary)">Loading...</div>
);

const withRouteSuspense = (node: ReactNode) => (
  <Suspense fallback={routeFallback}>{node}</Suspense>
);

const lazyRoute = <TModule,>(
  instance: i18n,
  namespaces: readonly AppNamespace[],
  loadModule: () => Promise<TModule>,
  selectComponent: (module: TModule) => ComponentType
) =>
  lazy(async () => {
    const [module] = await Promise.all([
      loadModule(),
      loadAppNamespaces(instance, namespaces),
    ]);
    return { default: selectComponent(module) };
  });

export const createRoutes = (instance: i18n) => {
  const t = instance.t.bind(instance);
  const AuthPage = lazyRoute(
    instance,
    ['auth'],
    () => import('./auth/AuthPage'),
    (module) => module.AuthPage
  );
  const ProfilePage = lazyRoute(
    instance,
    ['profile'],
    () => import('./auth/ProfilePage'),
    (module) => module.ProfilePage
  );
  const CommunityPage = lazyRoute(
    instance,
    ['community'],
    () => import('./community/CommunityPage'),
    (module) => module.CommunityPage
  );
  const CommunityDetailPage = lazyRoute(
    instance,
    ['community'],
    () => import('./community/CommunityDetailPage'),
    (module) => module.CommunityDetailPage
  );
  const Editor = lazyRoute(
    instance,
    ['editor'],
    () => import('./editor/Editor'),
    (module) => module.default
  );
  const EditorHome = lazyRoute(
    instance,
    ['editor'],
    () => import('./editor/EditorHome'),
    (module) => module.default
  );
  const ProjectHome = lazyRoute(
    instance,
    ['editor'],
    () => import('./editor/ProjectHome'),
    (module) => module.default
  );
  const WorkspaceIssuesPage = lazyRoute(
    instance,
    ['editor'],
    () => import('./editor/features/issues/WorkspaceIssuesPage'),
    (module) => module.default
  );
  const BlueprintEditor = lazyRoute(
    instance,
    ['blueprint'],
    () => import('./editor/features/blueprint'),
    (module) => module.default
  );
  const ComponentAuthoringPage = lazyRoute(
    instance,
    ['editor'],
    () => import('./editor/features/component/ComponentAuthoringPage'),
    (module) => module.default
  );
  const NodeGraphEditor = lazyRoute(
    instance,
    ['editor'],
    () => import('./editor/features/development/NodeGraphEditor'),
    (module) => module.default
  );
  const AnimationEditor = lazyRoute(
    instance,
    ['editor'],
    () => import('./editor/features/animation/AnimationEditor'),
    (module) => module.default
  );
  const ProjectResources = lazyRoute(
    instance,
    ['editor'],
    () => import('./editor/features/resources/ProjectResources'),
    (module) => module.ProjectResources
  );
  const CodeAuthoringPage = lazyRoute(
    instance,
    ['editor'],
    () => import('./editor/features/code/CodeAuthoringPage'),
    (module) => module.default
  );
  const ProjectTestingPage = lazyRoute(
    instance,
    ['editor'],
    () => import('./editor/features/testing/ProjectTestingPage'),
    (module) => module.default
  );
  const EditorSettingsPage = lazyRoute(
    instance,
    ['editor'],
    () => import('./editor/features/settings/EditorSettingsPage'),
    (module) => module.EditorSettingsPage
  );
  const ProjectSettingsPage = lazyRoute(
    instance,
    ['editor'],
    () => import('./editor/features/settings/ProjectSettingsPage'),
    (module) => module.ProjectSettingsPage
  );
  const ExportCode = lazyRoute(
    instance,
    ['export'],
    () => import('./editor/features/export/ExportCode'),
    (module) => module.ExportCode
  );

  return [
    {
      path: '/',
      element: <Home />,
    },
    {
      path: 'auth',
      element: withRouteSuspense(<AuthPage />),
    },
    {
      path: 'profile',
      element: withRouteSuspense(<ProfilePage />),
    },
    {
      path: 'editor',
      element: withRouteSuspense(<Editor />),
      children: [
        { index: true, element: withRouteSuspense(<EditorHome />) },
        {
          path: 'project/:projectId',
          children: [
            { index: true, element: withRouteSuspense(<ProjectHome />) },
            {
              path: 'blueprint',
              element: withRouteSuspense(<BlueprintEditor />),
            },
            {
              path: 'nodegraph',
              element: withRouteSuspense(<NodeGraphEditor />),
            },
            {
              path: 'component',
              element: withRouteSuspense(<ComponentAuthoringPage />),
            },
            {
              path: 'animation',
              element: withRouteSuspense(<AnimationEditor />),
            },
            {
              path: 'resources',
              element: withRouteSuspense(<ProjectResources />),
            },
            {
              path: 'code',
              element: withRouteSuspense(<CodeAuthoringPage />),
            },
            {
              path: 'issues',
              element: withRouteSuspense(<WorkspaceIssuesPage />),
            },
            {
              path: 'test',
              element: withRouteSuspense(<ProjectTestingPage />),
            },
            {
              path: 'export',
              element: withRouteSuspense(<ExportCode />),
            },
            {
              path: 'deployment',
              element: (
                <div>
                  {t('deploymentSettings', 'deploymentSettings', {
                    ns: 'routes',
                  })}
                </div>
              ),
            },
            {
              path: 'settings',
              element: withRouteSuspense(<ProjectSettingsPage />),
            },
          ],
        },
        {
          path: 'component',
          element: <Navigate to="/editor" replace />,
        },
        {
          path: 'blueprint',
          element: <Navigate to="/editor" replace />,
        },
        {
          path: 'nodegraph',
          element: withRouteSuspense(<NodeGraphEditor />),
        },
        {
          path: 'settings',
          element: withRouteSuspense(<EditorSettingsPage />),
        },
      ],
    },
    {
      path: 'community',
      element: withRouteSuspense(<CommunityPage />),
    },
    {
      path: 'community/:projectId',
      element: withRouteSuspense(<CommunityDetailPage />),
    },
    {
      path: 'about',
      element: <div>{t('aboutPage', 'aboutPage', { ns: 'routes' })}</div>,
    },
  ];
};
