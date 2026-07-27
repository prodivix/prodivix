import { describe, expect, it } from 'vitest';
import { validatePropsTransform } from '#contracts/contributionValidation';

const POINT = 'prodivix.renderPolicy';

const messages = (transform: Parameters<typeof validatePropsTransform>[1]) =>
  validatePropsTransform(POINT, transform, '/rules/0/props').map(
    (diagnostic) => diagnostic.message
  );

describe('validatePropsTransform prototype safety', () => {
  it.each([
    ['rename target', { rename: [{ from: 'title', to: '__proto__' }] }],
    ['rename source', { rename: [{ from: '__proto__', to: 'title' }] }],
    ['omit entry', { omit: ['__proto__'] }],
    [
      'defaults key',
      // A literal `__proto__` sets the prototype instead of creating an own
      // property; JSON.parse is how a real contribution arrives, and it does
      // create the own property this rule must catch.
      {
        defaults: JSON.parse('{"__proto__":{"polluted":true}}') as Record<
          string,
          unknown
        >,
      },
    ],
  ])('rejects a %s that would reach the prototype chain', (_label, transform) =>
    expect(
      messages(transform).some((message) => message.includes('is reserved'))
    ).toBe(true)
  );

  it('accepts ordinary property names', () =>
    expect(
      messages({
        rename: [{ from: 'title', to: 'label' }],
        omit: ['legacyProp'],
        defaults: { size: 'Medium' },
      })
    ).toEqual([]));

  it('accepts names that only look dangerous', () =>
    // `constructor` and `prototype` assign as own properties, so a component
    // whose prop is genuinely called either one stays expressible.
    expect(
      messages({ rename: [{ from: 'constructor', to: 'prototype' }] })
    ).toEqual([]));

  it('still reports the pre-existing duplicate and self-rename rules', () =>
    expect(
      messages({
        rename: [
          { from: 'title', to: 'label' },
          { from: 'title', to: 'caption' },
          { from: 'size', to: 'size' },
        ],
      }).length
    ).toBe(3));
});
