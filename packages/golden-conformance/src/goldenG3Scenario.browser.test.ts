import {
  expect as expectPage,
  type Locator,
  type Page,
} from '@playwright/test';
import { describe, expect, it } from 'vitest';
import type {
  BehaviorScenarioProgram,
  BehaviorSourceRef,
} from '@prodivix/behavior';
import { GOLDEN_G2_VUE_CATALOG_AUTH_SESSION_FIXTURE } from './goldenG2VueCatalogFixture';
import {
  createGoldenG3CatalogProgram,
  createGoldenG3ReactCatalogBundle,
  createGoldenG3VueCatalogBundle,
} from './goldenG3ScenarioFixture';
import {
  verifyGoldenBrowserProject,
  type GoldenGeneratedProjectBundle,
} from './generatedProjectHarness';

const decodePointerSegment = (value: string): string =>
  value.replaceAll('~1', '/').replaceAll('~0', '~');

const pirNodeId = (source: BehaviorSourceRef): string => {
  const marker = '/nodesById/';
  const index = source.path.indexOf(marker);
  if (index < 0) {
    throw new Error(
      `Behavior adapter expected a PIR node source: ${source.path}`
    );
  }
  return decodePointerSegment(source.path.slice(index + marker.length));
};

const collectionItemPathSuffix = (id: string): string => {
  const keyIdentity = `key/${'string'.length}:string/${id.length}:${id}`;
  return `/${keyIdentity.length}:${keyIdentity}`;
};

const targetLocator = (
  page: Page,
  program: BehaviorScenarioProgram,
  targetId: string
): Locator => {
  const target = program.targetManifest.find(
    (candidate) => candidate.targetId === targetId
  );
  if (!target) throw new Error(`Program target is missing: ${targetId}`);
  const documentValue = JSON.stringify(target.source.workspaceDocumentId);
  const nodeValue = JSON.stringify(pirNodeId(target.source));
  let selector =
    `[data-pir-document-id=${documentValue}]` +
    `[data-pir-node-id=${nodeValue}]`;
  if (target.instanceScope?.kind === 'collection-item') {
    const suffix = JSON.stringify(
      collectionItemPathSuffix(target.instanceScope.id)
    );
    selector += `[data-pir-instance-path$=${suffix}]`;
  }
  return page.locator(selector);
};

/** Adapter-private execution: the persisted Program never contains DOM locators. */
const runCatalogProgram = async (
  page: Page,
  program: BehaviorScenarioProgram
): Promise<void> => {
  for (const instruction of program.instructions) {
    if (instruction.operation.startsWith('trigger:')) continue;
    if (instruction.operation === 'navigate') {
      const route =
        typeof instruction.input === 'string' ? instruction.input : '/';
      await page.goto(new URL(route, page.url()).href, {
        waitUntil: 'networkidle',
      });
      continue;
    }
    if (instruction.operation === 'semantic-click') {
      if (!instruction.targetId) {
        throw new Error(`Click instruction has no target: ${instruction.id}`);
      }
      await targetLocator(page, program, instruction.targetId).click();
      continue;
    }
    if (instruction.operation.startsWith('observe:')) {
      const observation = program.observations.find(
        ({ stepId }) => stepId === instruction.stepId
      );
      if (!observation) {
        throw new Error(
          `Observation instruction has no automaton: ${instruction.id}`
        );
      }
      if (observation.kind === 'route') {
        if (typeof observation.expected === 'string') {
          expect(new URL(page.url()).pathname).toBe(observation.expected);
          continue;
        }
        const loaderValue = await page
          .locator('[data-prodivix-route-loader="ready"]')
          .textContent();
        if (loaderValue === null) {
          throw new Error(
            `Route observation has no loader projection: ${instruction.id}`
          );
        }
        expect(JSON.parse(loaderValue)).toEqual(observation.expected);
        continue;
      }
      if (observation.kind !== 'visible') {
        throw new Error(
          `Golden adapter does not support observation ${observation.kind}.`
        );
      }
      const locator = targetLocator(page, program, observation.targetId);
      if (observation.expected === false) {
        await expectPage(locator).toBeHidden();
      } else {
        await expectPage(locator).toBeVisible();
      }
      continue;
    }
    throw new Error(
      `Unsupported Golden Program operation: ${instruction.operation}`
    );
  }
};

const verifyTarget = async (
  bundle: GoldenGeneratedProjectBundle,
  program: BehaviorScenarioProgram
) =>
  verifyGoldenBrowserProject(bundle, {
    routePath: '/',
    browserChannel: process.env.E2E_BROWSER_CHANNEL,
    authSessionFixtureResponse: GOLDEN_G2_VUE_CATALOG_AUTH_SESSION_FIXTURE,
    verifyPage: async (page) => {
      await runCatalogProgram(page, program);
      await expectPage(page.getByText('Beta')).toBeVisible();
      await expectPage(page.getByTestId('product-card')).toHaveCount(2);
    },
  });

describe.runIf(process.env.PRODIVIX_VERIFY_G3_SCENARIO === '1')(
  'Golden G3 React/Vue Behavior Scenario browser parity',
  () => {
    it('executes one semantic Program against both generated framework targets', async () => {
      const program = createGoldenG3CatalogProgram();
      const [react, vue] = await Promise.all([
        verifyTarget(createGoldenG3ReactCatalogBundle(), program),
        verifyTarget(createGoldenG3VueCatalogBundle(), program),
      ]);
      expect(react.completedCommands).toContain('browser-smoke');
      expect(vue.completedCommands).toContain('browser-smoke');
      expect(react.routePath).toBe(vue.routePath);
    }, 600_000);
  }
);
