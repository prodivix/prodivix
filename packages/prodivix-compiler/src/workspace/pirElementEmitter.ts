/**
 * The only framework-syntax hole in PIR node compilation.
 *
 * Node traversal, SourceTrace collection, component contract resolution, slot
 * projection, instance-path derivation and trigger compilation are PIR
 * semantics and stay in `pirNodeCompiler`. A target supplies just the syntax
 * that wraps the resulting expressions, so two targets cannot diverge on
 * anything G3 needs to compare across them (ADR 31:344).
 */
import type { PirImportRegistry } from '#src/workspace/pirImportRegistry';

export type PirElementEmitter = Readonly<{
  /** Renders an ordered node list as one child expression. */
  fragment(children: readonly string[]): string;
  /**
   * Registers whatever list wrapper the target needs (React `Fragment`, Vue
   * `Fragment`) and returns its local name.
   */
  resolveFragmentLocal(imports: PirImportRegistry): string;
  /** A list wrapper carrying a stable Collection item key. */
  keyedFragment(input: {
    fragmentLocal: string;
    keyExpression: string;
    children: readonly string[];
  }): string;
  /** A list wrapper using an already-resolved local name. */
  wrappedFragment(input: {
    fragmentLocal: string;
    children: readonly string[];
  }): string;
  /** Renders a resolved host element with an already-compiled props object. */
  element(input: {
    tag: string;
    propsExpression: string;
    /** Already-compiled child expressions, text first when present. */
    children: readonly string[];
  }): string;
  /** Renders a compiled component module reference. */
  component(input: { localName: string; propsExpression: string }): string;
  /** Whether a resolved element name is emittable in this target's syntax. */
  isEmittableElement(value: string): boolean;
  /** Maps a PIR event name onto the target's prop convention. */
  eventPropName(eventName: string): string;
  /** Expression used where a node compiles to nothing. */
  readonly emptyExpression: string;
}>;
