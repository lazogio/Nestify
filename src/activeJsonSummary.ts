import { conversionTarget } from './activeEditor';
import { envKeyCount } from './envFormat';
import { countFlatKeys, depthOf } from './jsonNesting';
import { holdsJsonDocument } from './jsonString';
import { readSettings } from './settings';

/** What the view knows about the text a conversion would run on. */
export interface ActiveJsonSummary {
  /** The shape of that text, e.g. "66 keys · 10 levels deep". */
  readonly headerDetail?: string;
  /** Prose shown above the list when nothing can be converted. */
  readonly problem?: string;
  /** Whether that text is already flat, nested, or unknown. */
  readonly shape?: 'flat' | 'nested';
  /**
   * Whether any key is a joined path, i.e. whether nesting has anything to do.
   * Depth cannot answer this: `{ "a.b": 1, "c": { "d": 2 } }` is nested and
   * still has a key to nest.
   */
  readonly joinedKeys?: boolean;
  /**
   * Whether the text is a JSON string holding a document, i.e. whether there
   * is a layer of escaping to take off. Depth and key count say nothing about
   * it: a string is a scalar however much JSON it spells.
   */
  readonly jsonString?: boolean;
  /**
   * Whether the text reads as `.env` lines. None of the readings above apply to
   * one, since a `.env` is not JSON at all.
   */
  readonly envLines?: boolean;
}

// Parsing runs on every keystroke in the active file, so skip pathological sizes.
const MAX_ANALYSED_CHARS = 500_000;

/**
 * Describes the text a conversion would act on. It asks `conversionTarget()`
 * for that text, the same way the commands do, so the view cannot claim
 * something a conversion would not act on.
 */
export function summariseActiveJson(): ActiveJsonSummary {
  const target = conversionTarget();

  if (!target) {
    return { problem: 'Open a JSON file to convert it.' };
  }

  const { editor, range, hadSelection } = target;
  const text = editor.document.getText(range);
  const scope = hadSelection ? 'selection' : 'file';

  if (text.trim().length === 0) {
    return { problem: `The ${scope} is empty.` };
  }

  if (text.length > MAX_ANALYSED_CHARS) {
    return { headerDetail: `${scope} · too large to measure` };
  }

  // Both of these are asked before the parse below, not after it. Neither a
  // quote-stripped fragment nor a .env is valid JSON on its own, so a header that
  // waited for the parse called the file unconvertible while the row beneath it
  // converted the thing fine.
  if (holdsJsonDocument(text)) {
    return {
      headerDetail: hadSelection ? 'Selection: JSON string' : 'JSON string',
      jsonString: true,
      envLines: false
    };
  }

  const envKeys = envKeyCount(text);

  if (envKeys !== undefined) {
    const keys = `${envKeys} ${envKeys === 1 ? 'key' : 'keys'}`;

    return {
      headerDetail: hadSelection ? `Selection: .env · ${keys}` : `.env · ${keys}`,
      envLines: true
    };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(text.trim());
  } catch {
    return { problem: `The ${scope} is not valid JSON.`, jsonString: false, envLines: false };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return {
      problem: `The ${scope} is a single value, not an object or array.`,
      jsonString: false,
      envLines: false
    };
  }

  const { separator } = readSettings(editor.document.uri);
  let keyCount: number;
  let depth: number;

  try {
    // Counted rather than built: this runs on every keystroke, and only the
    // number is wanted. It still refuses whatever a conversion would.
    keyCount = countFlatKeys(parsed, { separator });
    depth = depthOf(parsed);
  } catch (error) {
    // Valid JSON that still cannot be flattened, such as two keys that join to
    // the same path. Saying so here beats a count the conversion would refuse.
    if (error instanceof Error && error.message.startsWith('Nestify: ')) {
      return { problem: asSentence(error) };
    }

    // Something the measurement itself could not carry, such as nesting deep
    // enough to exhaust the stack. A conversion may still work, so the view
    // says only that it cannot measure instead of standing in the way. This
    // runs on every keystroke, so it must never throw into the event loop.
    return { headerDetail: `${scope} · too large to measure` };
  }

  const keys = `${keyCount} ${keyCount === 1 ? 'key' : 'keys'}`;
  const nesting = depth <= 1 ? 'flat' : `${depth} levels deep`;

  return {
    // The file name is already on the editor tab, so this spends its width on
    // the two numbers a conversion changes.
    headerDetail: hadSelection ? `Selection: ${keys} · ${nesting}` : `${keys} · ${nesting}`,
    shape: depth <= 1 ? 'flat' : 'nested',
    joinedKeys: hasJoinedKeys(parsed, separator),
    jsonString: false,
    envLines: false
  };
}

/**
 * Whether nesting would find a key to split. An array has index keys only, and
 * `unflattenJson` refuses an array at the top level anyway.
 */
function hasJoinedKeys(parsed: object, separator: string): boolean {
  if (Array.isArray(parsed)) {
    return false;
  }

  return Object.keys(parsed).some((key) => key.includes(separator));
}

/** Turns a thrown Nestify error into prose the view can show above the list. */
function asSentence(error: Error): string {
  const message = error.message.replace(/^Nestify: /, '');
  return message.charAt(0).toUpperCase() + message.slice(1);
}
