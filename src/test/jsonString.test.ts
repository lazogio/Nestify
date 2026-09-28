import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { holdsJson, parseEmbeddedJson, toJsonStringLiteral } from '../jsonString';

/** The thrown message, so a test can assert on what the user would read. */
function messageFrom(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  assert.fail('expected the call to throw');
}

describe('parseEmbeddedJson', () => {
  it('reads the document a string literal holds', () => {
    assert.deepEqual(parseEmbeddedJson('"{\\"app\\":{\\"name\\":\\"nestify\\"}}"'), {
      app: { name: 'nestify' }
    });
  });

  it('reads an array the same way', () => {
    assert.deepEqual(parseEmbeddedJson('"[1,2]"'), [1, 2]);
  });

  it('ignores surrounding whitespace', () => {
    assert.deepEqual(parseEmbeddedJson('\n  "{\\"a\\":1}"  \n'), { a: 1 });
  });

  it('takes a fragment whose surrounding quotes were stripped', () => {
    // What a log viewer hands over when it shows the field's value alone.
    assert.deepEqual(parseEmbeddedJson('{\\"a\\":1}'), { a: 1 });
  });

  it('refuses text that is already JSON, and names the way back', () => {
    const message = messageFrom(() => parseEmbeddedJson('{"a": 1}'));

    assert.match(message, /an object already/);
    assert.match(message, /Stringify JSON/);
  });

  it('names what it was handed instead of a string', () => {
    assert.match(messageFrom(() => parseEmbeddedJson('[1]')), /an array already/);
    assert.match(messageFrom(() => parseEmbeddedJson('42')), /a number already/);
  });

  it('refuses a string that holds prose rather than JSON', () => {
    assert.match(messageFrom(() => parseEmbeddedJson('"hello"')), /does not hold JSON/);
  });

  it('keeps the parser\'s complaint for text that is not JSON at all', () => {
    assert.match(messageFrom(() => parseEmbeddedJson('{')), /not valid JSON/);
  });

  it('refuses an empty selection', () => {
    assert.match(messageFrom(() => parseEmbeddedJson('   ')), /nothing to convert/);
  });
});

describe('toJsonStringLiteral', () => {
  it('writes a literal that spells the document', () => {
    assert.equal(toJsonStringLiteral({ a: 1 }), '"{\\"a\\":1}"');
  });

  it('stays on one line however deep the document', () => {
    const literal = toJsonStringLiteral({ app: { window: { width: 800 } } });

    assert.ok(!literal.includes('\n'), 'expected no newline to escape into the literal');
  });

  it('round-trips through parseEmbeddedJson', () => {
    for (const value of [{ app: { name: 'nestify' } }, [1, { a: null }], 'hi', 42, {}]) {
      assert.deepEqual(parseEmbeddedJson(toJsonStringLiteral(value)), value);
    }
  });
});

describe('holdsJson', () => {
  it('is true for a string holding a document', () => {
    assert.equal(holdsJson('{"a":1}'), true);
  });

  it('is false for a string holding prose', () => {
    assert.equal(holdsJson('hello'), false);
  });

  it('is false for anything that is not a string', () => {
    assert.equal(holdsJson({ a: 1 }), false);
    assert.equal(holdsJson(null), false);
  });
});
