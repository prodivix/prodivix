import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  buildRoutePath,
  composeRouteManifestWithModules,
  matchRouteManifest,
  normalizeRoutePath,
  type WorkspaceRouteManifest,
  type WorkspaceRouteNode,
} from './index';

type SiblingIndexFlag = 'absent' | 'explicit-false';

const nonIndexSiblingTemplates: readonly WorkspaceRouteNode[] = [
  { id: 'route-static', segment: 'account', pageDocId: 'page-static' },
  { id: 'route-dynamic', segment: ':section', pageDocId: 'page-dynamic' },
  { id: 'route-wildcard', segment: '*', pageDocId: 'page-wildcard' },
];

const indexSibling: WorkspaceRouteNode = {
  id: 'route-index',
  index: true,
  pageDocId: 'page-index',
};

const applySiblingIndexFlag = (
  node: WorkspaceRouteNode,
  flag: SiblingIndexFlag
): WorkspaceRouteNode =>
  flag === 'explicit-false' ? { ...node, index: false } : node;

const siblingIndexFlagArbitrary = fc.constantFrom<SiblingIndexFlag>(
  'absent',
  'explicit-false'
);

const mixedFlagSiblingsArbitrary = fc
  .tuple(
    siblingIndexFlagArbitrary,
    siblingIndexFlagArbitrary,
    siblingIndexFlagArbitrary
  )
  .chain((flags) => {
    const siblings = [
      ...nonIndexSiblingTemplates.map((template, position) =>
        applySiblingIndexFlag(template, flags[position] as SiblingIndexFlag)
      ),
      indexSibling,
    ];
    return fc.shuffledSubarray(siblings, {
      minLength: siblings.length,
      maxLength: siblings.length,
    });
  });

const matchedIds = (manifest: WorkspaceRouteManifest, path: string): string[] =>
  matchRouteManifest(manifest, path).map((node) => node.id);

describe('route core properties', () => {
  it('normalizes and incrementally builds the same canonical path', () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/), {
          minLength: 1,
          maxLength: 8,
        }),
        (segments) => {
          const expected = `/${segments.join('/')}`;
          const authored = ` ${segments.join(' / ')} /?tab=preview#heading`;
          expect(normalizeRoutePath(authored)).toBe(expected);
          expect(normalizeRoutePath(expected)).toBe(expected);

          const built = segments.reduce(
            (parentPath, segment, index) =>
              buildRoutePath(parentPath, {
                id: `route-${index}`,
                segment,
              }),
            '/'
          );
          expect(built).toBe(expected);
        }
      )
    );
  });

  it('ranks siblings by a strict weak ordering across mixed index flags', () => {
    fc.assert(
      fc.property(mixedFlagSiblingsArbitrary, (children) => {
        const manifest: WorkspaceRouteManifest = {
          version: '1',
          root: { id: 'root', children },
        };

        // `index: false` and an omitted `index` describe the same non-index route,
        // so neither the flag representation nor the authored sibling order may
        // change which node wins static > dynamic > wildcard > index precedence.
        expect(matchedIds(manifest, '/account')).toEqual([
          'root',
          'route-static',
        ]);
        expect(matchedIds(manifest, '/settings')).toEqual([
          'root',
          'route-dynamic',
        ]);
        expect(matchedIds(manifest, '/settings/profile')).toEqual([
          'root',
          'route-wildcard',
        ]);
        expect(matchedIds(manifest, '/')).toEqual(['root', 'route-index']);
      })
    );
  });

  it('keeps static siblings reachable after mounting a dynamic route module', () => {
    fc.assert(
      fc.property(siblingIndexFlagArbitrary, (staticFlag) => {
        const manifest: WorkspaceRouteManifest = {
          version: '1',
          root: {
            id: 'root',
            children: [
              applySiblingIndexFlag(
                {
                  id: 'route-account',
                  segment: 'account',
                  pageDocId: 'page-account',
                },
                staticFlag
              ),
            ],
          },
          modules: {
            m: {
              moduleId: 'm',
              version: '1',
              root: { id: 'm-root', pageDocId: 'page-module' },
            },
          },
          mounts: [{ mountId: 'mt', moduleRef: 'm', mountPath: ':section' }],
        };

        // `cloneMountedRouteNode` stamps `index: false` on every mounted module
        // root, which must not let the dynamic mount shadow the static sibling.
        const composed = composeRouteManifestWithModules(manifest);
        expect(matchedIds(composed.manifest, '/account')).toEqual([
          'root',
          'route-account',
        ]);
      })
    );
  });
});
