import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  matchesBlueprintCompositionSequence,
  validateBlueprintTemplateContribution,
  validateCodegenPolicyContribution,
  validateExternalLibraryContribution,
  validatePaletteContribution,
  validateRenderPolicyContribution,
  type BlueprintTemplateContributionV1,
  type CodegenPolicyContributionV1,
  type PaletteContributionV1,
  type RenderPolicyContributionV1,
} from '@prodivix/plugin-contracts';
import { GENERATED_OFFICIAL_PLUGIN_CATALOG } from '#radix/catalog.generated';

const readJson = async (name: string): Promise<Record<string, unknown>> =>
  JSON.parse(
    await readFile(resolve(process.cwd(), 'plugin', name), 'utf8')
  ) as Record<string, unknown>;

const readContribution = (name: string) =>
  readJson(`contributions/${name}.json`);

describe('Radix official contribution resources', () => {
  it('validates all five non-empty contribution contracts', async () => {
    const [external, palette, templates, render, codegen] = await Promise.all([
      readContribution('external-library'),
      readContribution('palette'),
      readContribution('blueprint-template'),
      readContribution('render-policy'),
      readContribution('codegen-policy'),
    ]);

    expect(validateExternalLibraryContribution(external).ok).toBe(true);
    expect(validatePaletteContribution(palette).ok).toBe(true);
    expect(validateBlueprintTemplateContribution(templates).ok).toBe(true);
    expect(validateRenderPolicyContribution(render).ok).toBe(true);
    expect(validateCodegenPolicyContribution(codegen).ok).toBe(true);
  });

  it('closes ten Palette recipes over 37 real runtime types', async () => {
    const [paletteInput, templatesInput, renderInput, codegenInput] =
      await Promise.all([
        readContribution('palette'),
        readContribution('blueprint-template'),
        readContribution('render-policy'),
        readContribution('codegen-policy'),
      ]);
    const palette = paletteInput as unknown as PaletteContributionV1;
    const templates =
      templatesInput as unknown as BlueprintTemplateContributionV1;
    const render = renderInput as unknown as RenderPolicyContributionV1;
    const codegen = codegenInput as unknown as CodegenPolicyContributionV1;
    const items = palette.groups.flatMap((group) => group.items);
    const templateTypes = new Set(
      templates.templates.flatMap((template) =>
        Object.values(template.fragment.nodesByLocalId).map((node) => node.type)
      )
    );

    expect(items).toHaveLength(10);
    expect(templates.templates).toHaveLength(7);
    expect(GENERATED_OFFICIAL_PLUGIN_CATALOG.components).toHaveLength(37);
    expect(render.rules).toHaveLength(37);
    expect(codegen.rules).toHaveLength(37);
    expect(
      GENERATED_OFFICIAL_PLUGIN_CATALOG.components
        .filter((component) => component.creation === 'template-only')
        .every((component) => templateTypes.has(component.runtimeType))
    ).toBe(true);
  });

  it('keeps React children out of serializable Palette and template props', async () => {
    const [paletteInput, templatesInput] = await Promise.all([
      readContribution('palette'),
      readContribution('blueprint-template'),
    ]);
    const palette = paletteInput as unknown as PaletteContributionV1;
    const templates =
      templatesInput as unknown as BlueprintTemplateContributionV1;

    palette.groups
      .flatMap((group) => group.items)
      .forEach((item) =>
        expect(item.defaultProps ?? {}).not.toHaveProperty('children')
      );
    templates.templates
      .flatMap((template) => Object.values(template.fragment.nodesByLocalId))
      .forEach((node) =>
        expect(node.props ?? {}).not.toHaveProperty('children')
      );
  });

  it('declares scoped portals and namespace-based compound codegen', async () => {
    const [templatesInput, renderInput, codegenInput] = await Promise.all([
      readContribution('blueprint-template'),
      readContribution('render-policy'),
      readContribution('codegen-policy'),
    ]);
    const templates =
      templatesInput as unknown as BlueprintTemplateContributionV1;
    const render = renderInput as unknown as RenderPolicyContributionV1;
    const codegen = codegenInput as unknown as CodegenPolicyContributionV1;
    const hostOverlayTypes = render.rules
      .filter((rule) => rule.portal.mode === 'host-overlay')
      .map((rule) => rule.runtimeType)
      .sort();
    const dialogContent = codegen.rules.find(
      (rule) => rule.runtimeType === 'RadixDialogContent'
    );
    const slotRule = templates.compositionRules?.find(
      (rule) => rule.runtimeType === 'RadixSlot'
    );

    expect(hostOverlayTypes).toEqual([
      'RadixDialogPortal',
      'RadixDropdownMenuPortal',
      'RadixPopoverPortal',
      'RadixTooltipPortal',
    ]);
    expect(dialogContent?.import).toMatchObject({
      packageName: '@radix-ui/react-dialog',
      kind: 'namespace',
      imported: 'Dialog',
    });
    expect(dialogContent?.elementPath).toEqual(['Dialog', 'Content']);
    expect(slotRule?.slots[0]?.sequence).toBeDefined();
    expect(
      matchesBlueprintCompositionSequence(slotRule!.slots[0]!.sequence, [
        'RadixLabel',
      ])
    ).toBe(true);
    expect(
      matchesBlueprintCompositionSequence(slotRule!.slots[0]!.sequence, [
        'RadixLabel',
        'RadixSeparator',
      ])
    ).toBe(false);
  });
});
