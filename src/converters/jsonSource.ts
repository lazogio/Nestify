/**
 * Reading JSON out of editor text, with the spot a bad parse happened.
 *
 * Like `jsonNesting.ts`, this imports nothing from `vscode`, so the offset
 * arithmetic that decides where the cursor lands can be tested on its own.
 */

/** An error that can say where in the source text it happened. */
export class ConversionError extends Error {
  /** Offset into the text handed to the converter, or `undefined` if unknown. */
  readonly offset?: number;

  constructor(message: string, offset?: number) {
    super(message);
    this.name = 'ConversionError';
    this.offset = offset;
  }
}

/**
 * Parses the text a converter was given, or throws a `ConversionError` that
 * points at the character the parser stopped on.
 */
export function parseJsonSource(sourceText: string): unknown {
  // The parse runs on the trimmed text, so every offset it reports is short by
  // whatever was trimmed from the front.
  const leading = sourceText.length - sourceText.trimStart().length;
  const trimmed = sourceText.trim();

  if (trimmed.length === 0) {
    throw new ConversionError('There is nothing to convert — the selection is empty.');
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    throw new ConversionError(
      `The selected text is not valid JSON: ${reason}`,
      offsetIn(reason, leading)
    );
  }
}

/**
 * Where the parser gave up, read out of its own message — V8 spells it
 * "at position 42". A runtime that words it differently simply gets no offset,
 * and the conversion reports the problem without moving the cursor.
 */
function offsetIn(reason: string, leading: number): number | undefined {
  const match = /at position (\d+)/.exec(reason);

  return match ? leading + Number(match[1]) : undefined;
}
