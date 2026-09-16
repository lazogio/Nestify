/**
 * A tiny converter registry.
 *
 * A converter turns the text the user selected into the text that should
 * replace it. Registering here is the only thing a new format converter has to
 * do — `extension.ts` never needs to learn about it.
 */

import type { Uri } from 'vscode';
import type { ActiveJsonSummary } from '../activeJsonSummary';

/** What a conversion is running on, for settings a folder can override. */
export interface ConversionContext {
  /** The document the text came from, when it came from one. */
  readonly resource?: Uri;
}

export interface Converter {
  /** Stable identifier, e.g. "flatten" or "json-to-yaml". */
  readonly id: string;
  /** Human readable name, used in error messages and pickers. */
  readonly title: string;
  /**
   * Optional one or two word name used where space is tight, such as the
   * Activity Bar view. Falls back to `title`.
   */
  readonly shortTitle?: string;
  /**
   * Optional summary of the transform, shown next to the title in the Activity
   * Bar view and in the quick pick. Both sides of the change on one line reads
   * faster than stacking them, so sketch the shape rather than spelling out
   * real JSON: a narrow side bar truncates the tail, which is the half that
   * says what you get.
   */
  readonly hint?: string;
  /** Codicon id for the row in the Activity Bar. Falls back to a generic one. */
  readonly icon?: string;
  /** Why this converter would not help right now, read from the view's reading. */
  skipReason?(summary: ActiveJsonSummary): string | undefined;
  /** A before/after sketch for the tooltip, as JSON with comments. */
  readonly example?: string;
  /** Transforms the source text, or throws an Error explaining why it cannot. */
  run(sourceText: string, context?: ConversionContext): string;
}

const converters = new Map<string, Converter>();

/**
 * Adds a converter to the registry. Re-registering the same id replaces the
 * previous entry, which keeps extension reloads during development idempotent.
 */
export function registerConverter(converter: Converter): void {
  if (!converter.id) {
    throw new Error('Nestify: a converter must have a non-empty id.');
  }
  converters.set(converter.id, converter);
}

/** Returns the converter with this id, or `undefined` if none is registered. */
export function getConverter(id: string): Converter | undefined {
  return converters.get(id);
}

/** Returns the converter with this id, or throws if it is not registered. */
export function requireConverter(id: string): Converter {
  const converter = converters.get(id);
  if (!converter) {
    throw new Error(`Nestify: no converter registered for "${id}".`);
  }
  return converter;
}

/** Returns every registered converter, in registration order. */
export function listConverters(): Converter[] {
  return [...converters.values()];
}
