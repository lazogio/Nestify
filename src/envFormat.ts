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

  return entries.map(([key, value]) => `${checkedKey(key)}=${JSON.stringify(value)}`).join('\n');
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
  const lines = text.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    const statement = line.trim();

    if (statement.length === 0 || statement.startsWith('#')) {
      continue;
    }

    // The first "=" only. A value may hold more of them, as a connection string
    // or a base64 padding does.
    const at = statement.indexOf('=');

    if (at === -1) {
      throw new Error(
        `Line ${index + 1} sets no value: ${JSON.stringify(statement)}. Every line a ` +
          '.env carries is either a "key=value", a "#" comment, or blank.'
      );
    }

    const key = statement.slice(0, at).replace(/^export\s+/, '').trim();

    if (key.length === 0) {
      throw new Error(`Line ${index + 1} has nothing before its "=", so it names no key.`);
    }

    if (entries.has(key)) {
      throw new Error(
        `The key "${key}" is set twice, the second time on line ${index + 1}. Nesting ` +
          'would keep only one of the two values, so nothing is converted.'
      );
    }

    entries.set(key, decodeValue(statement.slice(at + 1).trim()));
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
function decodeValue(raw: string): unknown {
  if (raw.length === 0) {
    return '';
  }

  // Not JSON, and a shell reads single quotes as "nothing in here is escaped".
  if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1);
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

  if (/[\r\n]/.test(key)) {
    throw new Error(
      `The key "${key}" spans more than one line, and a .env sets one key per line.`
    );
  }

  if (key !== key.trim()) {
    throw new Error(
      `The key "${key}" has whitespace around it, which reading the line back would ` +
        'strip, so it would come back as a different key.'
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
