/**
 * Reading JSON out of a JSON string, and writing one back.
 *
 * JSON travels as a string far more often than it travels as JSON: a log line,
 * a database column, a webhook field carrying a whole document escaped inside
 * one value. Getting at it means taking one layer of escaping off, and putting
 * it back means adding one.
 *
 * Like `jsonNesting.ts`, this imports nothing from `vscode`, so the escaping
 * rules can be tested on their own.
 */

import { parseJsonSource } from './converters/jsonSource';

/**
 * The JSON a JSON string holds.
 *
 * Both layers have to be there: text that already spells a document has
 * nothing to unwrap, and a string holding prose is still not JSON.
 */
export function parseEmbeddedJson(sourceText: string): unknown {
  const embedded = jsonStringIn(sourceText);
  let parsed: unknown;

  try {
    parsed = JSON.parse(embedded);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    // Deliberately no offset: the parser counts characters in the decoded
    // string, where every escape has already changed the count, so carrying it
    // back would put the cursor on the wrong character.
    throw new Error(`The string does not hold JSON: ${reason}`);
  }

  // A string around a bare scalar is data that happens to parse, not a document
  // that arrived escaped. Unwrapping it changes the value: "1e5" would come back
  // as 100000, and the id "1234567890123456789" as 1234567890123456800, which is
  // a different id — the quotes are what kept its digits exact.
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(
      `The string holds ${describe(parsed)}, not a JSON object or array. ` +
        'A quoted value is left as it is, so an id keeps its digits.'
    );
  }

  return parsed;
}

/**
 * A JSON string literal holding this value, ready to paste into a field that
 * carries JSON as text.
 *
 * Written compact whatever `nestify.indent` says: the literal exists to travel
 * inside another document, where every newline comes back as a `\n` to read
 * around.
 */
export function toJsonStringLiteral(value: unknown): string {
  return JSON.stringify(JSON.stringify(value));
}

/**
 * Whether Parse JSON String has anything to do here. Never throws: the view
 * asks while you type.
 *
 * It answers by trying the conversion rather than by re-deciding what counts.
 * Anything else drifts from what the command does — a fragment whose quotes
 * were stripped is not valid JSON at all, so a header that judged it by parsing
 * would call the file unconvertible while the row converted it.
 */
export function holdsJsonDocument(sourceText: string): boolean {
  const trimmed = sourceText.trim();

  // Cheap bail before a parse that would only throw: this runs on every
  // keystroke, and text neither opening with a quote nor carrying an escaped
  // one cannot be a string around a document.
  if (!trimmed.startsWith('"') && !trimmed.includes('\\"')) {
    return false;
  }

  try {
    parseEmbeddedJson(sourceText);
    return true;
  } catch {
    return false;
  }
}

/** The string the text spells, whether or not its quotes survived the trip. */
function jsonStringIn(sourceText: string): string {
  let parsed: unknown;

  try {
    parsed = parseJsonSource(sourceText);
  } catch (error) {
    const bare = bareJsonStringIn(sourceText);

    if (bare === undefined) {
      throw error;
    }

    return bare;
  }

  if (typeof parsed !== 'string') {
    throw new Error(
      `Parsing needs a JSON string — this is ${describe(parsed)} already. ` +
        'Run Stringify JSON to wrap it in one.'
    );
  }

  return parsed;
}

/**
 * The string a fragment spells once the quotes it lost are put back.
 *
 * Quotes are the first thing a log viewer or a shell eats, and what is left
 * parses as nothing at all. Text still carrying an escaped quote can only have
 * been a string, so it is quoted back rather than refused — without that tell
 * there is nothing to say the text was ever one, and quoting arbitrary prose
 * would "convert" it into a string the user never wrote.
 */
function bareJsonStringIn(sourceText: string): string | undefined {
  const trimmed = sourceText.trim();

  if (!trimmed.includes('\\"')) {
    return undefined;
  }

  try {
    // Text that parses inside quotes can only have parsed to a string, so the
    // result needs no further checking.
    return JSON.parse(`"${trimmed}"`) as string;
  } catch {
    return undefined;
  }
}

/** How a refusal names what it was handed instead of a string. */
function describe(value: unknown): string {
  if (Array.isArray(value)) {
    return 'an array';
  }

  if (value === null) {
    return 'null';
  }

  return typeof value === 'object' ? 'an object' : `a ${typeof value}`;
}
