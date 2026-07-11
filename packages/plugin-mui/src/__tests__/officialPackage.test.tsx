import { describe, expect, it } from 'vitest';
import {
  BUNDLED_PLUGIN_ARTIFACT,
  GENERATED_OFFICIAL_PLUGIN_CATALOG,
  MUI_OFFICIAL_PLUGIN,
} from '#mui-plugin/index';
import {
  MUI_COMPONENT_DEFINITIONS,
  MUI_COMPONENTS,
} from '#mui-plugin/componentCatalog';
import {
  MUI_ICON_IMPLEMENTATION,
  MUI_OFFICIAL_HOST_MODULE,
} from '#mui-plugin/hostModule';
import { MUI_PALETTE_PROJECTION } from '#mui-plugin/paletteProjection';

const readArtifactJson = (path: string): Record<string, unknown> => {
  const resource = BUNDLED_PLUGIN_ARTIFACT.resources.find(
    (candidate) => candidate.path === path
  );
  if (!resource) throw new Error(`Missing artifact resource ${path}.`);
  return JSON.parse(
    new TextDecoder().decode(Uint8Array.from(resource.bytes))
  ) as Record<string, unknown>;
};

describe('Material UI official plugin package', () => {
  it('publishes the frozen 18 Palette plus 2 template-only runtime matrix', () => {
    expect(GENERATED_OFFICIAL_PLUGIN_CATALOG.support).toEqual({
      total: 20,
      supported: 16,
      template: 1,
      degraded: 3,
    });
    expect(MUI_COMPONENT_DEFINITIONS).toHaveLength(20);
    expect(
      MUI_COMPONENT_DEFINITIONS.filter(
        (component) => component.creation === 'template-only'
      ).map((component) => component.runtimeType)
    ).toEqual(['MuiAccordionSummary', 'MuiAccordionDetails']);
    expect(
      MUI_PALETTE_PROJECTION.groups.flatMap((group) => group.items)
    ).toHaveLength(18);
  });

  it('keeps descriptor, generated catalog, and Host implementation identities closed', () => {
    expect(MUI_OFFICIAL_PLUGIN).toMatchObject({
      artifact: BUNDLED_PLUGIN_ARTIFACT,
      catalog: GENERATED_OFFICIAL_PLUGIN_CATALOG,
    });
    expect(Object.keys(MUI_COMPONENTS).sort()).toEqual(
      MUI_COMPONENT_DEFINITIONS.map((component) => component.exportName).sort()
    );
    expect(
      Object.keys(MUI_OFFICIAL_HOST_MODULE.implementations).sort()
    ).toEqual(
      GENERATED_OFFICIAL_PLUGIN_CATALOG.hostImplementations
        .map((implementation) => implementation.id)
        .sort()
    );
    expect(BUNDLED_PLUGIN_ARTIFACT.packageDigest).toMatch(/^sha256-/);
    expect(BUNDLED_PLUGIN_ARTIFACT.resources).toHaveLength(8);
  });

  it('binds Accordion to one normalized three-node template', () => {
    const descriptor = readArtifactJson(
      'plugin/contributions/blueprint-template.json'
    ) as {
      templates: Array<{
        palette: { itemId: string };
        primaryLocalId: string;
        fragment: {
          nodesByLocalId: Record<string, { type: string; text?: string }>;
          childIdsByLocalId: Record<string, string[]>;
        };
      }>;
    };
    expect(descriptor.templates).toHaveLength(1);
    expect(descriptor.templates[0]).toMatchObject({
      palette: { itemId: 'mui-accordion' },
      primaryLocalId: 'accordion',
      fragment: {
        nodesByLocalId: {
          accordion: { type: 'MuiAccordion' },
          summary: { type: 'MuiAccordionSummary', text: 'Accordion' },
          details: { type: 'MuiAccordionDetails', text: 'Details' },
        },
        childIdsByLocalId: {
          accordion: ['summary', 'details'],
        },
      },
    });
  });

  it('keeps direct Palette defaults free of authored children props', () => {
    const descriptor = readArtifactJson(
      'plugin/contributions/palette.json'
    ) as {
      groups: Array<{
        items: Array<{ id: string; defaultProps?: Record<string, unknown> }>;
      }>;
    };
    const items = descriptor.groups.flatMap((group) => group.items);
    expect(
      items.filter((item) =>
        Object.prototype.hasOwnProperty.call(
          item.defaultProps ?? {},
          'children'
        )
      )
    ).toEqual([]);
    expect(
      MUI_PALETTE_PROJECTION.groups
        .flatMap((group) => group.items)
        .filter((item) =>
          Object.prototype.hasOwnProperty.call(
            item.defaultProps ?? {},
            'children'
          )
        )
    ).toEqual([]);
  });

  it('resolves real named Material Icon exports without a remote loader', () => {
    expect(MUI_ICON_IMPLEMENTATION.listExports()).toContain('Add');
    const first = MUI_ICON_IMPLEMENTATION.resolveExport('Add');
    expect(first).not.toBeNull();
    expect(MUI_ICON_IMPLEMENTATION.resolveExport('Add')).toBe(first);
    expect(
      MUI_ICON_IMPLEMENTATION.resolveExport('MissingIconExport')
    ).toBeNull();
  });
});
