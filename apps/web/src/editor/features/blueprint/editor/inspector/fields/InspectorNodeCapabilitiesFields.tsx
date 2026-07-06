import { InspectorRow } from '@/editor/features/blueprint/editor/inspector/components/InspectorRow';
import { LinkBasicsFields } from '@/editor/features/blueprint/editor/inspector/components/LinkBasicsFields';
import { useInspectorContext } from '@/editor/features/blueprint/editor/inspector/InspectorContext';

export function InspectorNodeCapabilitiesFields() {
  const {
    t,
    updateSelectedNode,
    isIconNode,
    SelectedIconComponent,
    selectedIconRef,
    setIconPickerOpen,
    linkPropKey,
    linkDestination,
    linkTarget,
    linkRel,
    linkTitle,
    targetPropKey,
    relPropKey,
    titlePropKey,
    selectedNode,
    routeOptions,
    outletRouteNodeId,
    activeRouteNodeId,
    bindOutletToRoute,
  } = useInspectorContext();
  const emptyTextValue =
    typeof selectedNode?.props?.emptyText === 'string'
      ? selectedNode.props.emptyText
      : '';
  const routeScopeValue =
    selectedNode?.props?.routeScope === 'module' ? 'module' : 'workspace';
  const moduleScopeValue =
    typeof selectedNode?.props?.moduleScope === 'string'
      ? selectedNode.props.moduleScope
      : '';
  const debugPathValue =
    typeof selectedNode?.props?.debugPath === 'string'
      ? selectedNode.props.debugPath
      : '';
  const selectedOutletRoute = routeOptions.find(
    (route: { id: string }) => route.id === outletRouteNodeId
  );
  const activeOutletRoute = routeOptions.find(
    (route: { id: string }) => route.id === activeRouteNodeId
  );
  const canBindActiveOutletRoute = Boolean(
    selectedNode?.type === 'PdxOutlet' &&
    activeRouteNodeId &&
    activeRouteNodeId !== outletRouteNodeId
  );
  const outletRouteStatus = selectedOutletRoute
    ? t('inspector.fields.outletRoute.boundTo', {
        path: selectedOutletRoute.path,
        defaultValue: 'Bound to {{path}}',
      })
    : t('inspector.fields.outletRoute.unbound', {
        defaultValue: 'Not bound',
      });

  return (
    <>
      {isIconNode && (
        <div className="InspectorField flex flex-col gap-1.5">
          <InspectorRow
            label={t('inspector.fields.icon.label', {
              defaultValue: 'Icon',
            })}
            control={
              <div className="flex w-full items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-7 min-w-0 flex-1 cursor-pointer items-center justify-start gap-2 rounded-md border border-(--border-default) bg-transparent px-2 text-left text-xs text-(--text-secondary)"
                  onClick={() => setIconPickerOpen(true)}
                  data-testid="inspector-open-icon-picker"
                >
                  <span className="inline-flex h-4 w-4 items-center justify-center text-(--text-primary)">
                    {SelectedIconComponent ? (
                      <SelectedIconComponent size={14} width={14} height={14} />
                    ) : null}
                  </span>
                  <span className="truncate">
                    {selectedIconRef
                      ? `${selectedIconRef.provider}:${selectedIconRef.name}`
                      : t('inspector.fields.icon.empty', {
                          defaultValue: 'No icon selected',
                        })}
                  </span>
                </button>
              </div>
            }
          />
        </div>
      )}
      {linkPropKey ? (
        <LinkBasicsFields
          destination={linkDestination}
          target={linkTarget as '_self' | '_blank'}
          rel={linkRel}
          title={linkTitle}
          t={t}
          onChangeDestination={(value) => {
            updateSelectedNode((current) => ({
              ...current,
              props: {
                ...(current.props ?? {}),
                [linkPropKey]: value,
              },
            }));
          }}
          onChangeTarget={(value) => {
            updateSelectedNode((current) => ({
              ...current,
              props: {
                ...(current.props ?? {}),
                [targetPropKey]: value,
              },
            }));
          }}
          onChangeRel={(value) => {
            updateSelectedNode((current) => ({
              ...current,
              props: {
                ...(current.props ?? {}),
                [relPropKey]: value,
              },
            }));
          }}
          onChangeTitle={(value) => {
            updateSelectedNode((current) => ({
              ...current,
              props: {
                ...(current.props ?? {}),
                [titlePropKey]: value,
              },
            }));
          }}
        />
      ) : null}
      {selectedNode?.type === 'PdxRoute' ? (
        <>
          <div className="InspectorField flex flex-col gap-1.5">
            <InspectorRow
              label={t('inspector.fields.routeScope.label', {
                defaultValue: 'Route Scope',
              })}
              control={
                <select
                  data-testid="inspector-route-scope"
                  className="w-full rounded-md border border-(--border-default) bg-transparent px-2 py-1 text-xs"
                  value={routeScopeValue}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    updateSelectedNode((current) => {
                      const nextProps = {
                        ...(current.props ?? {}),
                      } as Record<string, unknown>;
                      nextProps.routeScope =
                        value === 'module' ? 'module' : 'workspace';
                      delete nextProps.currentPath;
                      return { ...current, props: nextProps };
                    });
                  }}
                >
                  <option value="workspace">
                    {t('inspector.fields.routeScope.workspace', {
                      defaultValue: 'Workspace',
                    })}
                  </option>
                  <option value="module">
                    {t('inspector.fields.routeScope.module', {
                      defaultValue: 'Module',
                    })}
                  </option>
                </select>
              }
            />
          </div>
          <div className="InspectorField flex flex-col gap-1.5">
            <InspectorRow
              label={t('inspector.fields.routeModuleScope.label', {
                defaultValue: 'Module Scope',
              })}
              control={
                <input
                  data-testid="inspector-route-module-scope"
                  className="w-full rounded-md border border-(--border-default) bg-transparent px-2 py-1 text-xs"
                  placeholder={t(
                    'inspector.fields.routeModuleScope.placeholder',
                    {
                      defaultValue: 'account',
                    }
                  )}
                  value={moduleScopeValue}
                  disabled={routeScopeValue !== 'module'}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    updateSelectedNode((current) => {
                      const nextProps = {
                        ...(current.props ?? {}),
                      } as Record<string, unknown>;
                      if (value.trim()) {
                        nextProps.moduleScope = value;
                      } else {
                        delete nextProps.moduleScope;
                      }
                      return { ...current, props: nextProps };
                    });
                  }}
                />
              }
            />
          </div>
          <div className="InspectorField flex flex-col gap-1.5">
            <InspectorRow
              label={t('inspector.fields.routeDebugPath.label', {
                defaultValue: 'Debug Path',
              })}
              control={
                <input
                  data-testid="inspector-route-debug-path"
                  className="w-full rounded-md border border-(--border-default) bg-transparent px-2 py-1 text-xs"
                  placeholder={t(
                    'inspector.fields.routeDebugPath.placeholder',
                    {
                      defaultValue: '/settings/profile',
                    }
                  )}
                  value={debugPathValue}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    updateSelectedNode((current) => {
                      const nextProps = {
                        ...(current.props ?? {}),
                      } as Record<string, unknown>;
                      if (value.trim()) {
                        nextProps.debugPath = value;
                      } else {
                        delete nextProps.debugPath;
                      }
                      delete nextProps.currentPath;
                      return { ...current, props: nextProps };
                    });
                  }}
                />
              }
            />
          </div>
          <div className="InspectorField flex flex-col gap-1.5">
            <InspectorRow
              label={t('inspector.fields.routeEmptyText.label', {
                defaultValue: 'Empty Text',
              })}
              control={
                <input
                  data-testid="inspector-route-empty-text"
                  className="w-full rounded-md border border-(--border-default) bg-transparent px-2 py-1 text-xs"
                  placeholder={t(
                    'inspector.fields.routeEmptyText.placeholder',
                    {
                      defaultValue: 'No route module selected.',
                    }
                  )}
                  value={emptyTextValue}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    updateSelectedNode((current) => {
                      const nextProps = {
                        ...(current.props ?? {}),
                      } as Record<string, unknown>;
                      if (value.trim()) {
                        nextProps.emptyText = value;
                      } else {
                        delete nextProps.emptyText;
                      }
                      return { ...current, props: nextProps };
                    });
                  }}
                />
              }
            />
          </div>
        </>
      ) : null}
      {selectedNode?.type === 'PdxOutlet' ? (
        <div className="InspectorField flex flex-col gap-1.5">
          <InspectorRow
            label={t('inspector.fields.outletRoute.label', {
              defaultValue: 'Outlet Route',
            })}
            control={
              <div className="flex w-full min-w-0 flex-col gap-2">
                <select
                  className="h-8 w-full min-w-0 rounded-md border border-(--border-default) bg-transparent px-2 text-xs text-(--text-primary)"
                  value={outletRouteNodeId}
                  onChange={(event) => {
                    const routeNodeId = event.currentTarget.value;
                    if (!routeNodeId) {
                      if (outletRouteNodeId) {
                        bindOutletToRoute(outletRouteNodeId, undefined);
                      }
                      return;
                    }
                    bindOutletToRoute(routeNodeId, selectedNode?.id);
                  }}
                >
                  <option value="">
                    {t('inspector.fields.outletRoute.placeholder', {
                      defaultValue: 'Select route...',
                    })}
                  </option>
                  {routeOptions.map((route: { id: string; path: string }) => (
                    <option key={route.id} value={route.id}>
                      {route.path}
                    </option>
                  ))}
                </select>
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[11px] text-(--text-muted)">
                    {outletRouteStatus}
                  </span>
                  <div className="inline-flex shrink-0 items-center gap-1">
                    {activeRouteNodeId ? (
                      <button
                        type="button"
                        disabled={!canBindActiveOutletRoute}
                        className="rounded-md border border-(--border-default) px-2 py-1 text-xs hover:border-(--border-strong) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-40"
                        title={
                          activeOutletRoute
                            ? t(
                                'inspector.fields.outletRoute.bindActiveTitle',
                                {
                                  path: activeOutletRoute.path,
                                  defaultValue: 'Bind to active route {{path}}',
                                }
                              )
                            : undefined
                        }
                        onClick={() => {
                          if (!activeRouteNodeId || !selectedNode?.id) return;
                          bindOutletToRoute(activeRouteNodeId, selectedNode.id);
                        }}
                      >
                        {t('inspector.fields.outletRoute.bindActive', {
                          defaultValue: 'Bind Active',
                        })}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={!outletRouteNodeId}
                      className="rounded-md border border-(--border-default) px-2 py-1 text-xs hover:border-(--border-strong) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => {
                        if (!outletRouteNodeId) return;
                        bindOutletToRoute(outletRouteNodeId, undefined);
                      }}
                    >
                      {t('inspector.fields.outletRoute.clear', {
                        defaultValue: 'Clear',
                      })}
                    </button>
                  </div>
                </div>
                {selectedOutletRoute ? (
                  <div className="truncate rounded-md border border-(--border-subtle) bg-(--bg-raised) px-2 py-1 text-right text-[11px] text-(--text-secondary)">
                    {selectedOutletRoute.path}
                  </div>
                ) : null}
              </div>
            }
          />
        </div>
      ) : null}
    </>
  );
}
