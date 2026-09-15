/**
 * A tiny converter registry.
 *
 * A converter turns the text the user selected into the text that should
 * replace it. Registering here is the only thing a new format converter has to
 * do — `extension.ts` never needs to learn about it.
 */

export interface Converter {
  /** Stable identifier, e.g. "flatten" or "json-to-yaml". */
  readonly id: string;
  /** Human readable name, used in error messages and pickers. */
  readonly title: string;
  /**
   * Optional few-word summary of the transform, shown next to the title in the
   * Activity Bar view and in the quick pick. Keep it short enough not to wrap.
   */
  readonly hint?: string;
  /** Transforms the source text, or throws an Error explaining why it cannot. */
  run(sourceText: string): string;
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
