/**
 * Reading and writing the one-key-per-line shape of a `.env` file.
 *
 * Flattening already produces the keys such a file holds, so this module is only
 * the line format: how a key and a value become a line, and how a line becomes
 * them again. `jsonNesting.ts` does the nesting on either side of it.
 *
 * Like `jsonNesting.ts`, this imports nothing from `vscode`, so the quoting rules
 * can be tested on their own.
 */

import { ConversionError } from './converters/jsonSource';
import type { FlatJson } from './jsonNesting';

/**
 * The `.env` text for a flat map, one `key=value` per line.
 *
 * Values are written as JSON, which is what keeps them exact on the way back:
 * `.env` itself has no types, so an unquoted `02134` would read as a number and
 * come back as `2134`.
 */
export function toEnvText(flat: FlatJson): string {
  const entries = Object.entries(flat);

  // An empty document flattens to no keys at all, and writing that back would
  // silently blank the file rather than converting it.
  if (entries.length === 0) {
    throw new Error('There is nothing to write — the document sets no keys.');
  }

  return entries.map(([key, value]) => `${checkedKey(key)}=${encodeValue(value)}`).join('\n');
}

/**
 * The text a value is written as.
 *
 * JSON, except for a string a shell would rewrite. Double quotes are the one form
 * `source` and docker-compose expand, so `pass="a$USER"` reaches the tool the file
 * was generated for as `aroot` — corruption that Nestify's own reader cannot see,
 * because it round-trips the text perfectly. Single quotes expand nothing, and
 * `decodeValue` already reads them, so such a value goes out in those instead.
 */
function encodeValue(value: unknown): string {
  const literal = JSON.stringify(value);

  // Only a plain string can move: anything needing an escape needs JSON to carry
  // it, since a single-quoted value has no escaping at all.
  if (typeof value === 'string' && /[$`]/.test(value) && !/['\\\n\r\t\u0000-\u001f]/.test(value)) {
    return `'${value}'`;
  }

  return literal;
}

/**
 * The flat map a `.env` text sets.
 *
 * Deliberately tolerant of a file no one generated: blank lines, `#` comments, an
 * `export` prefix and single-quoted values are all read, since the point is to
 * open the `.env` you already have.
 */
export function parseEnvText(text: string): FlatJson {
  const entries = new Map<string, unknown>();

  // Walked rather than split, so every refusal can carry the offset of the line it
  // is about. A line number alone would count from the start of the converted
  // text, which is the wrong number whenever a selection is being converted.
  for (let at = 0; at <= text.length; ) {
    const breaks = text.indexOf('\n', at);
    const ends = breaks === -1 ? text.length : breaks;
    const line = text.slice(at, ends).replace(/\r$/, '');
    const lineAt = at;

    at = breaks === -1 ? text.length + 1 : breaks + 1;

    const statement = line.trim();

    if (statement.length === 0 || statement.startsWith('#')) {
      continue;
    }

    // The first "=" only. A value may hold more of them, as a connection string
    // or a base64 padding does.
    const splits = statement.indexOf('=');

    if (splits === -1) {
      throw new ConversionError(
        `This line sets no value: ${JSON.stringify(statement)}. Every line a .env ` +
          'carries is either a "key=value", a "#" comment, or blank.',
        lineAt
      );
    }

    const key = statement.slice(0, splits).replace(/^export\s+/, '').trim();

    if (key.length === 0) {
      throw new ConversionError('This line has nothing before its "=", so it names no key.', lineAt);
    }

    // Whitespace inside a name is what tells a .env apart from ordinary code: an
    // environment cannot hold "const a", so a `const a = 1` was never a .env line.
    if (/\s/.test(key)) {
      throw new ConversionError(
        `This line sets "${key}", which contains whitespace, so it is not the name of an ` +
          'environment variable.',
        lineAt
      );
    }

    if (entries.has(key)) {
      throw new ConversionError(
        `The key "${key}" is set twice. Nesting would keep only one of the two values, so ` +
          'nothing is converted.',
        lineAt
      );
    }

    entries.set(key, decodeValue(statement.slice(splits + 1).trim()));
  }

  if (entries.size === 0) {
    throw new Error('There is nothing to convert — no line here sets a key.');
  }

  // Built rather than assigned into, so a key called "__proto__" stays data.
  return Object.fromEntries(entries);
}

/**
 * How many keys the text sets, or `undefined` when it does not read as `.env`.
 *
 * Answered by trying the parse, the way `holdsJsonDocument` does: a view that
 * judged the text some other way would drift from what the conversion accepts.
 * Never throws — it runs on every keystroke.
 */
export function envKeyCount(text: string): number | undefined {
  const trimmed = text.trim();

  // Cheap bail before a parse that would only throw. JSON is the other thing
  // this extension reads, and a document opening like one is not a list of
  // assignments.
  if (trimmed.length === 0 || /^[{["]/.test(trimmed)) {
    return undefined;
  }

  try {
    return Object.keys(parseEnvText(text)).length;
  } catch {
    return undefined;
  }
}

/**
 * The value a line spells.
 *
 * JSON is trusted only when it round-trips — re-writing the parsed value has to
 * give back the very text that was read. That is what keeps a file no one
 * generated intact: `1234567890123456789` parses to `1234567890123456800`, which
 * is a different id, so it stays the string it was written as, and `1e5` stays
 * `"1e5"` rather than becoming `100000`. Whatever `toEnvText` wrote is exactly
 * what `JSON.stringify` produced, so it always survives the check.
 */
function decodeValue(value: string): unknown {
  // Not JSON, and a shell reads single quotes as "nothing in here is escaped".
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  // An inline comment ends an unquoted value, the way dotenv reads one. Inside
  // quotes a "#" is part of the value, so a quoted value is left whole — which is
  // every value Nestify itself writes.
  const raw = value.startsWith('"') ? value : value.replace(/\s+#.*$/, '').trimEnd();

  if (raw.length === 0) {
    return '';
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (JSON.stringify(parsed) === raw) {
      return parsed;
    }
  } catch {
    // Not JSON at all, so it is the bare text the line spells.
  }

  return raw;
}

/** The key, or a refusal naming what about it could not be read back. */
function checkedKey(key: string): string {
  if (key.length === 0) {
    throw new Error('A key here is empty, so its line would have nothing before the "=".');
  }

  // "=" is what separates a key from its value, so a key holding one would read
  // back as a shorter key with a longer value.
  if (key.includes('=')) {
    throw new Error(
      `The key "${key}" contains "=", which separates a key from its value, so its line ` +
        'could not be read back. Convert a part of the file that does not contain it.'
    );
  }

  // Any whitespace, not just a line break or a surrounding space: an environment
  // holds no name containing one, and reading the line back would not give it
  // again.
  if (/\s/.test(key)) {
    throw new Error(
      `The key "${key}" contains whitespace, so it is not the name of an environment ` +
        'variable and could not be read back.'
    );
  }


  if (key.startsWith('#')) {
    throw new Error(
      `The key "${key}" starts with "#", which marks a comment, so its line would be ` +
        'skipped when read back.'
    );
  }

  return key;
}
