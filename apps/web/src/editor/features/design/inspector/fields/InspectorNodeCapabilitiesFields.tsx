import { InspectorRow } from '@/editor/features/design/inspector/components/InspectorRow';
import { LinkBasicsFields } from '@/editor/features/design/inspector/components/LinkBasicsFields';
import { useInspectorContext } from '@/editor/features/design/inspector/InspectorContext';

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
    selectedParentNode,
  } = useInspectorContext();
  const currentPathValue =
    typeof selectedNode?.props?.currentPath === 'string'
      ? selectedNode.props.currentPath
      : '';
  const emptyTextValue =
    typeof selectedNode?.props?.emptyText === 'string'
      ? selectedNode.props.emptyText
      : '';
  const isDirectRouteChild = selectedParentNode?.type === 'PdxRoute';
  const routePathValue =
    typeof selectedNode?.props?.['data-route-path'] === 'string'
      ? selectedNode.props['data-route-path']
      : '';
  const routeFallbackValue =
    selectedNode?.props?.['data-route-fallback'] === true;
  const routeIndexValue = selectedNode?.props?.['data-route-index'] === true;

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
              label={t('inspector.fields.routeCurrentPath.label', {
                defaultValue: 'Current Path',
              })}
              control={
                <input
                  data-testid="inspector-route-current-path"
                  className="w-full rounded-md border border-(--border-default) bg-transparent px-2 py-1 text-xs"
                  placeholder={t(
                    'inspector.fields.routeCurrentPath.placeholder',
                    {
                      defaultValue: '/about/team',
                    }
                  )}
                  value={currentPathValue}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    updateSelectedNode((current) => ({
                      ...current,
                      props: {
                        ...(current.props ?? {}),
                        currentPath: value,
                      },
                    }));
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
                      defaultValue: 'No route matched.',
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
      {isDirectRouteChild ? (
        <>
          <div className="InspectorField flex flex-col gap-1.5">
            <InspectorRow
              label={t('inspector.fields.routePath.label', {
                defaultValue: 'Route Path',
              })}
              control={
                <input
                  data-testid="inspector-route-child-path"
                  className="w-full rounded-md border border-(--border-default) bg-transparent px-2 py-1 text-xs"
                  placeholder={t('inspector.fields.routePath.placeholder', {
                    defaultValue: '/about or details/:id',
                  })}
                  value={routePathValue}
                  disabled={routeIndexValue}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    updateSelectedNode((current) => {
                      const nextProps = {
                        ...(current.props ?? {}),
                      } as Record<string, unknown>;
                      if (value.trim()) {
                        nextProps['data-route-path'] = value;
                        delete nextProps['data-route-fallback'];
                        delete nextProps['data-route-index'];
                      } else {
                        delete nextProps['data-route-path'];
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
              label={t('inspector.fields.routeIndex.label', {
                defaultValue: 'Index Route',
              })}
              control={
                <label className="inline-flex items-center gap-2 text-xs text-(--text-secondary)">
                  <input
                    data-testid="inspector-route-child-index"
                    type="checkbox"
                    checked={routeIndexValue}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      updateSelectedNode((current) => {
                        const nextProps = {
                          ...(current.props ?? {}),
                        } as Record<string, unknown>;
                        if (checked) {
                          nextProps['data-route-index'] = true;
                          delete nextProps['data-route-path'];
                          delete nextProps['data-route-fallback'];
                        } else {
                          delete nextProps['data-route-index'];
                        }
                        return { ...current, props: nextProps };
                      });
                    }}
                  />
                  {t('inspector.fields.routeIndex.hint', {
                    defaultValue: 'Match parent route path exactly',
                  })}
                </label>
              }
            />
          </div>
          <div className="InspectorField flex flex-col gap-1.5">
            <InspectorRow
              label={t('inspector.fields.routeFallback.label', {
                defaultValue: 'Fallback',
              })}
              control={
                <label className="inline-flex items-center gap-2 text-xs text-(--text-secondary)">
                  <input
                    data-testid="inspector-route-child-fallback"
                    type="checkbox"
                    checked={routeFallbackValue}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      updateSelectedNode((current) => {
                        const nextProps = {
                          ...(current.props ?? {}),
                        } as Record<string, unknown>;
                        if (checked) {
                          nextProps['data-route-fallback'] = true;
                          delete nextProps['data-route-path'];
                          delete nextProps['data-route-index'];
                        } else {
                          delete nextProps['data-route-fallback'];
                        }
                        return { ...current, props: nextProps };
                      });
                    }}
                  />
                  {t('inspector.fields.routeFallback.hint', {
                    defaultValue: 'Render when no route path matched',
                  })}
                </label>
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
              <div className="flex w-full items-center gap-2">
                <select
                  className="min-w-0 flex-1 rounded-md border border-(--border-default) bg-transparent px-2 py-1 text-xs"
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
                {activeRouteNodeId ? (
                  <button
                    type="button"
                    className="rounded-md border border-(--border-default) px-2 py-1 text-xs hover:border-(--border-strong) hover:text-(--text-primary)"
                    onClick={() =>
                      bindOutletToRoute(activeRouteNodeId, selectedNode.id)
                    }
                  >
                    {t('inspector.fields.outletRoute.bindActive', {
                      defaultValue: 'Bind Active',
                    })}
                  </button>
                ) : null}
                {outletRouteNodeId ? (
                  <button
                    type="button"
                    className="rounded-md border border-(--border-default) px-2 py-1 text-xs hover:border-(--border-strong) hover:text-(--text-primary)"
                    onClick={() =>
                      bindOutletToRoute(outletRouteNodeId, undefined)
                    }
                  >
                    {t('inspector.fields.outletRoute.clear', {
                      defaultValue: 'Clear',
                    })}
                  </button>
                ) : null}
              </div>
            }
          />
        </div>
      ) : null}
    </>
  );
}
