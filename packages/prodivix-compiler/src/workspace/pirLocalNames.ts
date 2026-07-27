/**
 * Generated local binding names for one compiled PIR module.
 *
 * `toIdentifier` is lossy — `hero-card` and `hero_card` both normalise to
 * `hero_card` — while PIR node ids are unconstrained strings. Deriving a local
 * `const` name straight from the normalised id therefore lets a descendant
 * shadow an ancestor's binding inside its own initializer, which is a
 * self-referencing `const` in the emitted module. Reserving every generated
 * suffix through one registry per module keeps the id-to-identifier mapping
 * injective, so distinct PIR ids can never share a binding name.
 */

export const toIdentifier = (value: string): string => {
  const candidate = value.replace(/[^a-zA-Z0-9_$]/g, '_');
  return /^[a-zA-Z_$]/.test(candidate) ? candidate : `_${candidate}`;
};

export class PirLocalNameRegistry {
  private readonly suffixByKey = new Map<string, string>();
  private readonly reservedSuffixes = new Set<string>();

  /**
   * Returns the stable identifier suffix for the given PIR id parts, allocating
   * a fresh one on first request. Repeated calls for the same parts return the
   * same suffix so a node's scope const, data const, slot bindings and
   * collection locals all agree.
   */
  reserve(...idParts: readonly string[]): string {
    const key = JSON.stringify(idParts);
    const existing = this.suffixByKey.get(key);
    if (existing !== undefined) return existing;
    const requested = idParts.map(toIdentifier).join('_');
    let suffix = requested;
    let attempt = 2;
    while (this.reservedSuffixes.has(suffix)) {
      suffix = `${requested}${attempt}`;
      attempt += 1;
    }
    this.suffixByKey.set(key, suffix);
    this.reservedSuffixes.add(suffix);
    return suffix;
  }
}
