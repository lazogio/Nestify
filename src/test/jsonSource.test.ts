import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConversionError, parseJsonSource } from '../converters/jsonSource';

/** The error a bad parse threw, so a test can read its offset. */
function errorFrom(sourceText: string): ConversionError {
  try {
    parseJsonSource(sourceText);
  } catch (error) {
    assert.ok(error instanceof ConversionError);
    return error;
  }

  assert.fail('expected the parse to throw');
}

describe('parseJsonSource', () => {
  it('returns what the text spells', () => {
    assert.deepEqual(parseJsonSource('{"a": 1}'), { a: 1 });
  });

  it('ignores surrounding whitespace', () => {
    assert.deepEqual(parseJsonSource('\n  {"a": 1}  \n'), { a: 1 });
  });

  it('refuses text that holds nothing', () => {
    const error = errorFrom('   \n  ');

    assert.match(error.message, /nothing to convert/);
    assert.equal(error.offset, undefined);
  });

  it('points at the character the parser stopped on', () => {
    const source = '{"a": 1,}';
    const error = errorFrom(source);

    assert.ok(error.offset !== undefined, 'expected an offset');
    assert.equal(source[error.offset], '}');
  });

  it('counts the offset from the text it was given, not the trimmed text', () => {
    const indented = '\n\n  {"a": 1,}';
    const error = errorFrom(indented);

    assert.ok(error.offset !== undefined, 'expected an offset');
    // Without the leading whitespace the offset would land three characters early.
    assert.equal(indented[error.offset], '}');
  });

  it("names the parser's complaint in the message", () => {
    assert.match(errorFrom('{').message, /not valid JSON/);
  });
});
