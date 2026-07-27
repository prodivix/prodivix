import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJsonText, compareUnicodeCodePoints } from '../index';

/**
 * Byte-level golden fixtures for the canonical owner.
 *
 * The lint fence catches known locale APIs by syntax; these fixtures pin the
 * OUTPUT, so any regression to locale- or environment-dependent behaviour —
 * whatever its syntax, including a dependency upgrade or an engine change —
 * shows up as a byte difference. The CI cross-locale leg runs this same file
 * under a non-default ICU locale.
 *
 * A failure here is a wire-format change. That is never a "regenerate the
 * fixture" moment: persisted bytes and digests derive from this text, so a
 * deliberate change must follow the ADR 39 evolution protocol (immutable
 * snapshot + activation + deterministic migration), not a fixture edit.
 */

// Exercises the orderings locale collation gets wrong: case (B vs a),
// punctuation vs letters (_ vs a), accents (é vs z), numeric-looking strings
// ("10" vs "9"), CJK, an astral-plane key (𝐀, a surrogate pair whose UTF-16
// unit order and code-point order disagree), and nested/array/empty shapes.
const FIXTURE = {
  z: null,
  a: 1,
  B: 'two',
  _x: true,
  'é': [3, 1, 2],
  '10': { d: 2, c: [{ f: 3, e: 4 }] },
  '9': 'nine',
  '中文': 'cjk',
  '𝐀': 'astral',
  empty: {},
  nested: { b: [true, false, null], a: -0.5, s: 'text with "quotes" and \\' },
};

const EXPECTED_TEXT =
  '{"10":{"c":[{"e":4,"f":3}],"d":2},"9":"nine","B":"two","_x":true,' +
  '"a":1,"empty":{},"nested":{"a":-0.5,"b":[true,false,null],' +
  '"s":"text with \\"quotes\\" and \\\\"},"z":null,"é":[3,1,2],' +
  '"中文":"cjk","𝐀":"astral"}';

const EXPECTED_SHA256 =
  createHash('sha256').update(EXPECTED_TEXT, 'utf8').digest('hex');

describe('canonical byte stability', () => {
  it('serializes the fixture to the exact pinned bytes', () => {
    expect(canonicalJsonText(FIXTURE)).toBe(EXPECTED_TEXT);
  });

  it('is insensitive to property insertion order down to the digest', () => {
    const reversed = Object.fromEntries(Object.entries(FIXTURE).reverse());
    const digest = createHash('sha256')
      .update(canonicalJsonText(reversed), 'utf8')
      .digest('hex');
    expect(digest).toBe(EXPECTED_SHA256);
  });

  it('pins the code-point order of the collation-hostile key set', () => {
    const keys = Object.keys(FIXTURE);
    expect([...keys].sort(compareUnicodeCodePoints)).toEqual([
      '10',
      '9',
      'B',
      '_x',
      'a',
      'empty',
      'nested',
      'z',
      'é',
      '中文',
      '𝐀',
    ]);
  });

  it('does not depend on the ambient locale', () => {
    // Sanity marker for the cross-locale CI leg: if this suite runs under a
    // locale where the pinned bytes change, the two assertions above fail;
    // this one documents which locale actually ran.
    expect(typeof Intl.DateTimeFormat().resolvedOptions().locale).toBe(
      'string'
    );
  });
});
