import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { holdsJsonDocument, parseEmbeddedJson, toJsonStringLiteral } from '../jsonString';

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

  it('leaves a quoted id alone rather than handing back a different number', () => {
    // Unwrapped it parses to 1234567890123456800, which is not the id that was
    // written: the quotes are what kept its digits exact.
    const message = messageFrom(() => parseEmbeddedJson('"1234567890123456789"'));

    assert.match(message, /not a JSON object or array/);
    assert.match(message, /keeps its digits/);
  });

  it('refuses a string around any bare scalar, which is data rather than a document', () => {
    assert.match(messageFrom(() => parseEmbeddedJson('"1e5"')), /holds a number/);
    assert.match(messageFrom(() => parseEmbeddedJson('"true"')), /holds a boolean/);
    assert.match(messageFrom(() => parseEmbeddedJson('"null"')), /holds null/);
    assert.match(messageFrom(() => parseEmbeddedJson('"\\"hi\\""')), /holds a string/);
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
    // Scalars are left out on purpose: the pair converts documents, and
    // parseEmbeddedJson refuses a string around a bare value.
    for (const value of [{ app: { name: 'nestify' } }, [1, { a: null }], {}, []]) {
      assert.deepEqual(parseEmbeddedJson(toJsonStringLiteral(value)), value);
    }
  });

  it('takes one layer off, so a twice-escaped document needs two runs', () => {
    const once = toJsonStringLiteral({ a: 1 });

    assert.deepEqual(parseEmbeddedJson(once), { a: 1 });
    // One run hands back the literal that was wrapped, which is a string and is
    // refused as one rather than being quietly unwrapped twice.
    assert.match(messageFrom(() => parseEmbeddedJson(toJsonStringLiteral(once))), /holds a string/);
  });
});

describe('holdsJsonDocument', () => {
  it('is true for a string literal around a document', () => {
    assert.equal(holdsJsonDocument('"{\\"a\\":1}"'), true);
  });

  it('is true for a fragment whose quotes were stripped', () => {
    // The header would otherwise call this unconvertible while the row converts it.
    assert.equal(holdsJsonDocument('{\\"a\\":1}'), true);
  });

  it('is false for a string around a bare scalar', () => {
    assert.equal(holdsJsonDocument('"1234567890123456789"'), false);
    assert.equal(holdsJsonDocument('"true"'), false);
  });

  it('is false for JSON that is not escaped at all', () => {
    assert.equal(holdsJsonDocument('{"a":1}'), false);
    assert.equal(holdsJsonDocument('{"a":"say \\"hi\\""}'), false);
  });

  it('is false for prose and for an empty selection', () => {
    assert.equal(holdsJsonDocument('"hello"'), false);
    assert.equal(holdsJsonDocument('   '), false);
  });
});
