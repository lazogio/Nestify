/**
 * Pure JSON flatten / unflatten helpers.
 *
 * This module intentionally has no `vscode` import so it can be unit tested,
 * reused from a CLI, or bundled anywhere else.
 */

export interface NestingOptions {
  /** Separator used to join and split key paths. Defaults to ".". */
  separator?: string;
  /**
   * What nesting does with a container whose keys are exactly the indices
   * `0…n-1`: rebuild the array it came from, or leave the object. Defaults to
   * "rebuild". Flattening ignores this.
   */
  arrays?: 'rebuild' | 'objects';
}

/** A flat map of dot-joined key paths to leaf values. */
export type FlatJson = Record<string, unknown>;

const DEFAULT_SEPARATOR = '.';

/**
 * The one path segment that cannot be rebuilt: assigning to "__proto__" sets an
 * object's prototype instead of recording a key. "constructor" and "prototype"
 * were refused alongside it, but on a plain object they are ordinary
 * own-property writes, so refusing them only blocked valid data.
 */
const UNSAFE_SEGMENT = '__proto__';

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
 * refused rather than letting the second write bury the first, as is any key
 * `unflattenJson` could not take back: an empty segment, or `__proto__`.
 */
export function flattenJson(input: unknown, options: NestingOptions = {}): FlatJson {
  const separator = resolveSeparator(options.separator);

  if (!isContainer(input)) {
    throw new TypeError('Nestify: flattenJson expects a JSON object or array at the top level.');
  }

  const into: Flattening = { leaves: new Map(), separator };

  walk(input, [], into);

  // `Object.fromEntries` defines each key as an own property whatever it is
  // called, where a plain `result[key] = …` would treat some names as
  // instructions; the Map keeps the keys in the order they were met.
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

  rejectWhatCannotBeNestedBack(path, flatKey);

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

/**
 * Refuses a key that `unflattenJson` would not accept back, so the two
 * directions agree by construction rather than by coincidence. Flattening such
 * a key used to succeed and strand the data in its flat form.
 */
function rejectWhatCannotBeNestedBack(path: string[], flatKey: string): void {
  if (path.includes(UNSAFE_SEGMENT)) {
    throw new SyntaxError(
      `Nestify: the key "${flatKey}" cannot be nested back — "${UNSAFE_SEGMENT}" is a reserved ` +
        'path segment. Rename it, or convert a part of the file that does not contain it.'
    );
  }

  if (path.some((segment) => segment.length === 0)) {
    throw new SyntaxError(
      `Nestify: the key "${flatKey}" cannot be nested back — one of its segments is empty.`
    );
  }
}

/** Names a path the way the source spells it, so both sides of a clash are readable. */
function describePath(path: string[]): string {
  return path.map((segment) => JSON.stringify(segment)).join(' → ');
}

/**
 * 1 for a flat object, 2 once a value is itself a populated object, and so on.
 *
 * An empty object or array counts as a leaf, not a level, because that is how
 * `flattenJson` treats it. Counting it as a level made a visibly flat file
 * report "2 levels deep" over a single `[]`.
 */
export function depthOf(value: unknown): number {
  if (!isContainer(value)) {
    return 0;
  }

  const children = Object.values(value as Record<string, unknown>);

  if (children.length === 0) {
    return 0;
  }

  // A loop rather than `Math.max(...children.map(depthOf))`: spreading passes
  // one argument per child, and a file with enough of them overflows the stack.
  let deepest = 0;

  for (const child of children) {
    deepest = Math.max(deepest, depthOf(child));
  }

  return 1 + deepest;
}

/**
 * Rebuilds a nested structure from a flat map of `separator`-joined keys.
 *
 * A container whose keys are exactly the indices `0…n-1` becomes the array it
 * was flattened from, so `{ "tags.0": "a" }` comes back as `{ tags: ["a"] }`.
 * Gaps and out-of-order numeric keys stay an object, since no array could hold
 * them without inventing values. Pass `arrays: "objects"` to keep every
 * container an object, which is what a document of numeric keys wants.
 */
export function unflattenJson(
  input: unknown,
  options: NestingOptions = {}
): Record<string, unknown> | unknown[] {
  const separator = resolveSeparator(options.separator);

  if (!isPlainObject(input)) {
    throw new TypeError('Nestify: unflattenJson expects a flat JSON object at the top level.');
  }

  const result: Record<string, unknown> = {};
  // Only the containers this call creates may become arrays; a leaf value that
  // was already an object stays exactly as the flat document spelled it.
  const built = new Set<Record<string, unknown>>();

  for (const flatKey of Object.keys(input)) {
    const segments = flatKey.split(separator);

    if (segments.some((segment) => segment.length === 0)) {
      throw new SyntaxError(`Nestify: the key "${flatKey}" contains an empty path segment.`);
    }

    if (segments.includes(UNSAFE_SEGMENT)) {
      throw new SyntaxError(`Nestify: the key "${flatKey}" uses the reserved path segment "${UNSAFE_SEGMENT}".`);
    }

    let cursor = result;

    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      // An own-property lookup: a plain `cursor[segment]` also finds inherited
      // members, so a key called "toString" or "valueOf" read as an existing
      // value and the whole document was refused.
      const existing = Object.prototype.hasOwnProperty.call(cursor, segment)
        ? cursor[segment]
        : undefined;

      if (existing === undefined) {
        const child: Record<string, unknown> = {};
        built.add(child);
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

  if (options.arrays === 'objects') {
    return result;
  }

  built.add(result);
  return rebuildArrays(result, built);
}

/** Rebuilds the arrays under `container`, deepest first, then the container. */
function rebuildArrays(
  container: Record<string, unknown>,
  built: Set<Record<string, unknown>>
): Record<string, unknown> | unknown[] {
  for (const key of Object.keys(container)) {
    const value = container[key];

    if (isPlainObject(value) && built.has(value)) {
      container[key] = rebuildArrays(value, built);
    }
  }

  return asArray(container) ?? container;
}

/**
 * The array whose indices these keys are, or `undefined` when they are not
 * exactly `0…n-1`. `Object.keys` lists index-like keys in ascending order, so
 * keys that arrived out of order still rebuild; "01" is not an index and so
 * keeps the container an object.
 */
function asArray(container: Record<string, unknown>): unknown[] | undefined {
  const keys = Object.keys(container);

  if (keys.length === 0) {
    return undefined;
  }

  for (let i = 0; i < keys.length; i++) {
    if (keys[i] !== String(i)) {
      return undefined;
    }
  }

  return keys.map((key) => container[key]);
}

/**
 * The same value with every plain object's keys in order, for a diff that does
 * not depend on where a key was written. Arrays keep their order, an array's
 * order being its meaning.
 */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  // Built from entries so that a key named after a prototype member is written
  // as data rather than acted on.
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeysDeep(value[key])])
  );
}
