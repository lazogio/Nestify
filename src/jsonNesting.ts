/**
 * Pure JSON flatten / unflatten helpers.
 *
 * This module intentionally has no `vscode` import so it can be unit tested,
 * reused from a CLI, or bundled anywhere else.
 */

export interface NestingOptions {
  /** Separator used to join and split key paths. Defaults to ".". */
  separator?: string;
}

/** A flat map of dot-joined key paths to leaf values. */
export type FlatJson = Record<string, unknown>;

const DEFAULT_SEPARATOR = '.';

/** Path segments that would let a crafted payload reach Object.prototype. */
const UNSAFE_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

function resolveSeparator(separator: string | undefined): string {
  const value = separator ?? DEFAULT_SEPARATOR;
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError('Nestify: the separator must be a non-empty string.');
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === 'object' && value !== null;
}

/**
 * Flattens nested objects and arrays into a single-level map whose keys are the
 * key paths joined with `separator`. Array items contribute their index as a
 * path segment, so `{ tags: ["a"] }` flattens to `{ "tags.0": "a" }`.
 *
 * Empty objects and arrays are preserved as leaf values, so that flattening and
 * unflattening does not silently drop them.
 *
 * Two different paths can join to the same key when a key already contains the
 * separator — `{ "a.b": 1, "a": { "b": 2 } }` yields `"a.b"` twice. That is
 * refused rather than letting the second write bury the first.
 */
export function flattenJson(input: unknown, options: NestingOptions = {}): FlatJson {
  const separator = resolveSeparator(options.separator);

  if (!isContainer(input)) {
    throw new TypeError('Nestify: flattenJson expects a JSON object or array at the top level.');
  }

  const into: Flattening = { leaves: new Map(), separator };

  walk(input, [], into);

  // Built in one go rather than assigned key by key: a plain `result[key] = …`
  // with a key of "__proto__" sets the prototype instead of recording the key,
  // which loses it. `Object.fromEntries` defines an own property either way,
  // and a Map keeps the keys in the order they were met.
  return Object.fromEntries([...into.leaves].map(([key, leaf]) => [key, leaf.value]));
}

/** The state a single `flattenJson` call threads through its recursion. */
interface Flattening {
  /** Flat key to its leaf value and the path that produced it. */
  readonly leaves: Map<string, { readonly path: string[]; readonly value: unknown }>;
  readonly separator: string;
}

function walk(value: unknown, path: string[], into: Flattening): void {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      assignLeaf(into, path, []);
      return;
    }
    value.forEach((item, index) => walk(item, [...path, String(index)], into));
    return;
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      assignLeaf(into, path, {});
      return;
    }
    for (const key of keys) {
      walk(value[key], [...path, key], into);
    }
    return;
  }

  assignLeaf(into, path, value);
}

function assignLeaf(into: Flattening, path: string[], value: unknown): void {
  // Only reachable when the whole document is an empty object or array; there
  // is no key to record it under, so the flat result is simply empty.
  if (path.length === 0) {
    return;
  }

  const flatKey = path.join(into.separator);
  const taken = into.leaves.get(flatKey);

  if (taken) {
    throw new SyntaxError(
      `Nestify: the key "${flatKey}" would be written twice — ${describePath(taken.path)} and ` +
        `${describePath(path)} join to the same key. Set the separator to a character ` +
        'your keys do not contain.'
    );
  }

  into.leaves.set(flatKey, { path, value });
}

/** Names a path the way the source spells it, so both sides of a clash are readable. */
function describePath(path: string[]): string {
  return path.map((segment) => JSON.stringify(segment)).join(' → ');
}

/**
 * Rebuilds a nested structure from a flat map of `separator`-joined keys.
 *
 * Numeric path segments are treated as ordinary object keys, never as array
 * indices: `{ "tags.0": "a" }` becomes `{ tags: { "0": "a" } }`. Arrays are
 * never reconstructed, which keeps the transform lossless for sparse or
 * non-sequential numeric keys.
 */
export function unflattenJson(input: unknown, options: NestingOptions = {}): Record<string, unknown> {
  const separator = resolveSeparator(options.separator);

  if (!isPlainObject(input)) {
    throw new TypeError('Nestify: unflattenJson expects a flat JSON object at the top level.');
  }

  const result: Record<string, unknown> = {};

  for (const flatKey of Object.keys(input)) {
    const segments = flatKey.split(separator);

    if (segments.some((segment) => segment.length === 0)) {
      throw new SyntaxError(`Nestify: the key "${flatKey}" contains an empty path segment.`);
    }

    const unsafe = segments.find((segment) => UNSAFE_SEGMENTS.has(segment));
    if (unsafe !== undefined) {
      throw new SyntaxError(`Nestify: the key "${flatKey}" uses the reserved path segment "${unsafe}".`);
    }

    let cursor = result;

    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      const existing = cursor[segment];

      if (existing === undefined) {
        const child: Record<string, unknown> = {};
        cursor[segment] = child;
        cursor = child;
        continue;
      }

      if (!isPlainObject(existing)) {
        throw new SyntaxError(
          `Nestify: the key "${flatKey}" conflicts with an earlier key — ` +
            `"${segments.slice(0, i + 1).join(separator)}" is already a value.`
        );
      }

      cursor = existing;
    }

    const leaf = segments[segments.length - 1];
    if (Object.prototype.hasOwnProperty.call(cursor, leaf)) {
      throw new SyntaxError(`Nestify: the key "${flatKey}" is defined more than once.`);
    }

    cursor[leaf] = input[flatKey];
  }

  return result;
}
