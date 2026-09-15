import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { flattenJson, unflattenJson } from '../jsonNesting';

/** The thrown message, so a test can assert on what the user would read. */
function messageFrom(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  assert.fail('expected the call to throw');
}

describe('flattenJson', () => {
  it('joins nested keys with the separator', () => {
    assert.deepEqual(flattenJson({ app: { name: 'nestify', window: { width: 800 } } }), {
      'app.name': 'nestify',
      'app.window.width': 800
    });
  });

  it('turns array indices into path segments', () => {
    assert.deepEqual(flattenJson({ tags: ['a', 'b'] }), { 'tags.0': 'a', 'tags.1': 'b' });
  });

  it('flattens an array at the top level', () => {
    assert.deepEqual(flattenJson([{ id: 1 }]), { '0.id': 1 });
  });

  it('keeps empty containers as leaf values', () => {
    assert.deepEqual(flattenJson({ nothing: {}, none: [] }), { nothing: {}, none: [] });
  });

  it('keeps null and false, which are leaves rather than containers', () => {
    assert.deepEqual(flattenJson({ a: null, b: false }), { a: null, b: false });
  });

  it('has nothing to record for a wholly empty document', () => {
    assert.deepEqual(Object.keys(flattenJson({})), []);
    assert.deepEqual(Object.keys(flattenJson([])), []);
  });

  it('honours a custom separator', () => {
    assert.deepEqual(flattenJson({ a: { b: 1 } }, { separator: '/' }), { 'a/b': 1 });
  });

  it('refuses a scalar at the top level', () => {
    assert.throws(() => flattenJson('nope'), TypeError);
    assert.throws(() => flattenJson(null), TypeError);
  });

  it('refuses an empty separator', () => {
    assert.throws(() => flattenJson({ a: 1 }, { separator: '' }), TypeError);
  });

  describe('keys that join to the same path', () => {
    it('refuses a literal dotted key that collides with a nested one', () => {
      const message = messageFrom(() => flattenJson({ 'a.b': 1, a: { b: 2 } }));

      assert.match(message, /"a\.b"/);
      assert.match(message, /twice/);
    });

    it('refuses the collision whichever key comes first', () => {
      assert.throws(() => flattenJson({ a: { b: 2 }, 'a.b': 1 }), SyntaxError);
    });

    it('names both paths, so it is clear which keys clash', () => {
      const message = messageFrom(() => flattenJson({ 'a.b': 1, a: { b: 2 } }));

      // The literal key stands alone; the nested one is spelled out segment by
      // segment, so the two sides of the clash can be told apart.
      assert.match(message, /"a\.b" and "a" → "b"/);
    });

    it('spots a collision between an array index and a literal key', () => {
      assert.throws(() => flattenJson({ 'tags.0': 'x', tags: ['y'] }), SyntaxError);
    });

    it('spots a collision an empty container would cause', () => {
      assert.throws(() => flattenJson({ 'a.b': 1, a: { b: {} } }), SyntaxError);
    });

    it('allows the same keys once the separator no longer occurs in them', () => {
      assert.deepEqual(flattenJson({ 'a.b': 1, a: { b: 2 } }, { separator: '/' }), {
        'a.b': 1,
        'a/b': 2
      });
    });

    it('leaves keys that merely look similar alone', () => {
      assert.deepEqual(flattenJson({ 'a.b': 1, a: { c: 2 } }), { 'a.b': 1, 'a.c': 2 });
    });
  });

  it('records a "__proto__" key as data rather than setting the prototype', () => {
    // JSON.parse is how the extension gets here, and it makes "__proto__" an
    // ordinary own key — unlike an object literal, which sets the prototype.
    const flat = flattenJson(JSON.parse('{"__proto__": {"polluted": true}}'));

    assert.deepEqual(Object.keys(flat), ['__proto__.polluted']);
    assert.equal(flat['__proto__.polluted'], true);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
  });

  it('survives JSON.stringify, which is how the extension writes it back', () => {
    assert.equal(JSON.stringify(flattenJson({ a: { b: 1 } })), '{"a.b":1}');
  });
});

describe('unflattenJson', () => {
  it('splits joined keys back into nested objects', () => {
    assert.deepEqual(unflattenJson({ 'app.name': 'nestify', 'app.window.width': 800 }), {
      app: { name: 'nestify', window: { width: 800 } }
    });
  });

  it('rebuilds numeric segments as object keys, not arrays', () => {
    const nested = unflattenJson({ 'tags.0': 'a' }) as { tags: unknown };

    assert.deepEqual(nested, { tags: { 0: 'a' } });
    assert.equal(Array.isArray(nested.tags), false);
  });

  it('honours a custom separator', () => {
    assert.deepEqual(unflattenJson({ 'a/b': 1 }, { separator: '/' }), { a: { b: 1 } });
  });

  it('refuses an empty path segment', () => {
    assert.throws(() => unflattenJson({ 'a..b': 1 }), SyntaxError);
  });

  it('refuses a reserved path segment', () => {
    for (const key of ['__proto__.x', 'a.constructor', 'a.prototype.b']) {
      assert.throws(() => unflattenJson({ [key]: 1 }), SyntaxError);
    }
  });

  it('refuses a key that conflicts with an earlier value', () => {
    const message = messageFrom(() => unflattenJson({ a: 1, 'a.b': 2 }));

    assert.match(message, /"a\.b"/);
    assert.match(message, /already a value/);
  });

  it('refuses a key already built as a parent of another', () => {
    const message = messageFrom(() => unflattenJson({ 'a.b.c': 1, 'a.b': 2 }));

    assert.match(message, /"a\.b"/);
    assert.match(message, /defined more than once/);
  });

  it('refuses anything but an object at the top level', () => {
    assert.throws(() => unflattenJson([1, 2]), TypeError);
    assert.throws(() => unflattenJson('nope'), TypeError);
  });
});

describe('round trips', () => {
  it('returns objects unchanged when they hold no arrays', () => {
    const original = { app: { name: 'nestify', window: { width: 800 } }, debug: false };

    assert.deepEqual(unflattenJson(flattenJson(original)), original);
  });

  it('turns arrays into objects on the way back, as documented', () => {
    assert.deepEqual(unflattenJson(flattenJson({ tags: ['a', 'b'] })), {
      tags: { 0: 'a', 1: 'b' }
    });
  });
});
