import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { PdxInput, PdxSelect } from '@prodivix/ui';
import { Code2 } from 'lucide-react';
import type { ComponentNode } from '@prodivix/shared/types/pir';
import { useInspectorContext } from '@/editor/features/design/inspector/InspectorContext';
import { InspectorRow } from '@/editor/features/design/inspector/components/InspectorRow';
import { buildCodeResourceFilesFromWorkspaceDocuments } from '@/editor/features/resources/workspaceCodeResources';
import { useEditorStore } from '@/editor/store/useEditorStore';
import type {
  InspectorPanelDefinition,
  InspectorPanelRenderProps,
} from './types';
import {
  readExternalCodeConfig,
  supportsExternalCodePanel,
} from './panelCapabilities';

type ExternalCodeConfig = NonNullable<
  ReturnType<typeof readExternalCodeConfig>
>;
const EXTERNAL_CODE_PROP_KEY = 'externalCode';

const getResourceLanguage = (
  path: string
): ExternalCodeConfig['language'] | null => {
  const normalized = path.trim().toLowerCase();
  if (normalized.endsWith('.ts') || normalized.endsWith('.tsx')) {
    return 'ts';
  }
  if (
    normalized.endsWith('.js') ||
    normalized.endsWith('.jsx') ||
    normalized.endsWith('.mjs') ||
    normalized.endsWith('.cjs')
  ) {
    return 'js';
  }
  if (normalized.endsWith('.wgsl')) {
    return 'wgsl';
  }
  if (normalized.endsWith('.glsl')) {
    return 'glsl';
  }
  return null;
};

const isResourceCompatibleWithLanguage = (
  path: string,
  language: ExternalCodeConfig['language']
) => {
  const resourceLanguage = getResourceLanguage(path);
  if (!resourceLanguage || !language) return true;
  if (language === 'ts') {
    return resourceLanguage === 'ts' || resourceLanguage === 'js';
  }
  return resourceLanguage === language;
};

const updateExternalCodeConfig = (
  node: ComponentNode,
  updater: (current: ExternalCodeConfig) => ExternalCodeConfig | null
) => {
  const currentConfig = readExternalCodeConfig(node) ?? {};
  const nextConfig = updater(currentConfig);
  const nextProps = { ...(node.props ?? {}) };

  if (!nextConfig) {
    delete nextProps[EXTERNAL_CODE_PROP_KEY];
  } else {
    nextProps[EXTERNAL_CODE_PROP_KEY] = nextConfig;
  }

  return {
    ...node,
    props: Object.keys(nextProps).length ? nextProps : undefined,
  };
};

function ExternalCodePanelView({
  node,
  updateNode,
}: InspectorPanelRenderProps) {
  const navigate = useNavigate();
  const { t, projectId } = useInspectorContext();
  const workspaceDocumentsById = useEditorStore(
    (state) => state.workspaceDocumentsById
  );
  const externalCode = readExternalCodeConfig(node) ?? {};
  const isMounted = externalCode.enabled === true;
  const selectedLanguage = externalCode.language ?? 'ts';
  const codeResourceFiles = useMemo(
    () =>
      buildCodeResourceFilesFromWorkspaceDocuments(
        workspaceDocumentsById
      ).filter((item) => item.path !== 'code'),
    [workspaceDocumentsById]
  );
  const compatibleResourceOptions = useMemo(() => {
    const matchedFiles = codeResourceFiles.filter((item) =>
      isResourceCompatibleWithLanguage(item.path, selectedLanguage)
    );
    const currentPath = externalCode.resourcePath?.trim() ?? '';
    const currentExists = matchedFiles.some(
      (item) => item.path === currentPath
    );
    const options = matchedFiles.map((item) => ({
      label: item.path.replace(/^code\//, ''),
      value: item.path,
    }));
    if (currentPath && !currentExists) {
      options.unshift({
        label: `${currentPath.replace(/^code\//, '')} (${t(
          'inspector.panels.external-code.status.missing',
          {
            defaultValue: 'missing',
          }
        )})`,
        value: currentPath,
      });
    }
    return options;
  }, [codeResourceFiles, externalCode.resourcePath, selectedLanguage, t]);
  const hasCompatibleResources = compatibleResourceOptions.length > 0;
  const selectedResourceExists = codeResourceFiles.some(
    (item) => item.path === externalCode.resourcePath
  );
  const openProjectResources = () => {
    const resolvedProjectId = projectId?.trim();
    if (!resolvedProjectId) return;
    navigate(`/editor/project/${resolvedProjectId}/resources`);
  };

  return (
    <div className="flex flex-col gap-2 pt-1 pb-1">
      <div className="flex items-center justify-between gap-2 py-1">
        <div className="text-[10px] text-(--text-muted)">
          {isMounted
            ? t('inspector.panels.external-code.status.mounted', {
                defaultValue: 'Mounted to external runtime',
              })
            : t('inspector.panels.external-code.status.unmounted', {
                defaultValue: 'Not mounted',
              })}
        </div>
        <button
          type="button"
          className="h-6 px-1.5 text-[10px] text-(--text-secondary) hover:text-(--text-primary)"
          onClick={() =>
            updateNode((current) =>
              updateExternalCodeConfig(current, (config) =>
                isMounted
                  ? null
                  : {
                      enabled: true,
                      language: config.language ?? 'ts',
                      resourcePath: config.resourcePath ?? '',
                      entry: config.entry ?? 'main',
                    }
              )
            )
          }
        >
          {isMounted
            ? t('inspector.panels.external-code.actions.unmount', {
                defaultValue: 'Unmount',
              })
            : t('inspector.panels.external-code.actions.mount', {
                defaultValue: 'Mount',
              })}
        </button>
      </div>
      <div className="rounded-md border border-(--border-default) px-2 py-1.5 text-[10px] text-(--text-muted)">
        {t('inspector.panels.external-code.description', {
          defaultValue:
            'Mount project script or shader resources for Canvas, WebGL, or other runtime-driven components.',
        })}
      </div>
      <InspectorRow
        label={t('inspector.panels.external-code.fields.projectResource', {
          defaultValue: 'Project Resource',
        })}
        description={t(
          'inspector.panels.external-code.fields.projectResourceHelp',
          {
            defaultValue:
              'Choose from code/scripts or code/shaders resources that match the selected language.',
          }
        )}
        layout="vertical"
        control={
          <div className="flex flex-col gap-1.5">
            <PdxSelect
              size="Small"
              value={externalCode.resourcePath ?? ''}
              options={compatibleResourceOptions}
              placeholder={t(
                'inspector.panels.external-code.placeholders.projectResource',
                {
                  defaultValue: 'Select a project resource',
                }
              )}
              disabled={!hasCompatibleResources}
              onChange={(value) =>
                updateNode((current) =>
                  updateExternalCodeConfig(current, (config) => ({
                    ...config,
                    enabled: config.enabled ?? true,
                    resourcePath: value,
                    language:
                      getResourceLanguage(value) ?? config.language ?? 'ts',
                  }))
                )
              }
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-(--text-muted)">
                {!hasCompatibleResources
                  ? t('inspector.panels.external-code.empty', {
                      defaultValue:
                        'No matching script or shader resources are available yet.',
                    })
                  : externalCode.resourcePath && !selectedResourceExists
                    ? t(
                        'inspector.panels.external-code.status.resourceMissing',
                        {
                          defaultValue:
                            'The selected resource path is no longer present in project resources.',
                        }
                      )
                    : t('inspector.panels.external-code.status.resourceReady', {
                        defaultValue: 'Project resource is ready to mount.',
                      })}
              </span>
              <button
                type="button"
                className="h-6 px-1.5 text-[10px] text-(--text-secondary) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-40"
                onClick={openProjectResources}
                disabled={!projectId?.trim()}
              >
                {t('inspector.panels.external-code.actions.manageResources', {
                  defaultValue: 'Manage',
                })}
              </button>
            </div>
          </div>
        }
      />
      <InspectorRow
        label={t('inspector.panels.external-code.fields.language', {
          defaultValue: 'Language',
        })}
        control={
          <PdxSelect
            size="Small"
            value={selectedLanguage}
            options={[
              { label: 'TypeScript', value: 'ts' },
              { label: 'JavaScript', value: 'js' },
              { label: 'GLSL', value: 'glsl' },
              { label: 'WGSL', value: 'wgsl' },
            ]}
            onChange={(value) =>
              updateNode((current) =>
                updateExternalCodeConfig(current, (config) => ({
                  ...config,
                  enabled: config.enabled ?? true,
                  language: value as ExternalCodeConfig['language'],
                  resourcePath: isResourceCompatibleWithLanguage(
                    config.resourcePath ?? '',
                    value as ExternalCodeConfig['language']
                  )
                    ? config.resourcePath
                    : '',
                }))
              )
            }
          />
        }
      />
      <InspectorRow
        label={t('inspector.panels.external-code.fields.resourcePath', {
          defaultValue: 'Resource Path',
        })}
        description={t(
          'inspector.panels.external-code.fields.resourcePathHelp',
          {
            defaultValue:
              'Relative project resource path under scripts or shaders.',
          }
        )}
        control={
          <PdxInput
            size="Small"
            value={externalCode.resourcePath ?? ''}
            onChange={(value) =>
              updateNode((current) =>
                updateExternalCodeConfig(current, (config) => ({
                  ...config,
                  enabled: config.enabled ?? true,
                  resourcePath: value,
                }))
              )
            }
            placeholder={t(
              'inspector.panels.external-code.placeholders.resourcePath',
              {
                defaultValue: 'code/scripts/render.ts',
              }
            )}
          />
        }
      />
      <InspectorRow
        label={t('inspector.panels.external-code.fields.entry', {
          defaultValue: 'Entry',
        })}
        description={t('inspector.panels.external-code.fields.entryHelp', {
          defaultValue: 'Export or function name used by the runtime host.',
        })}
        control={
          <PdxInput
            size="Small"
            value={externalCode.entry ?? ''}
            onChange={(value) =>
              updateNode((current) =>
                updateExternalCodeConfig(current, (config) => ({
                  ...config,
                  enabled: config.enabled ?? true,
                  entry: value,
                }))
              )
            }
            placeholder={t(
              'inspector.panels.external-code.placeholders.entry',
              {
                defaultValue: 'main',
              }
            )}
          />
        }
      />
    </div>
  );
}

export const externalCodePanel: InspectorPanelDefinition = {
  key: 'external-code',
  title: 'External Code',
  tab: 'code',
  match: supportsExternalCodePanel,
  headerActions: (
    <span
      className="inline-flex h-5 w-5 items-center justify-center text-(--text-muted)"
      aria-hidden="true"
    >
      <Code2 size={14} />
    </span>
  ),
  render: (props) => <ExternalCodePanelView {...props} />,
};
