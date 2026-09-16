import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { depthOf, flattenJson, unflattenJson } from '../jsonNesting';

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

  describe('keys that share a name with an Object.prototype member', () => {
    it('nests a key called "toString" like any other', () => {
      assert.deepEqual(unflattenJson({ 'toString.x': 1 }), { toString: { x: 1 } });
    });

    it('nests one deeper in the path too', () => {
      assert.deepEqual(unflattenJson({ 'a.valueOf.b': 1 }), { a: { valueOf: { b: 1 } } });
    });

    it('round trips such a key', () => {
      const original = JSON.parse('{"toString": {"x": 1}, "hasOwnProperty": {"y": 2}}');

      assert.deepEqual(unflattenJson(flattenJson(original)), original);
    });

    it('still refuses a real conflict on such a name', () => {
      assert.throws(() => unflattenJson({ toString: 1, 'toString.x': 2 }), SyntaxError);
    });
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

describe('depthOf', () => {
  it('counts a scalar as no depth at all', () => {
    assert.equal(depthOf('nestify'), 0);
    assert.equal(depthOf(null), 0);
  });

  it('counts a flat object as one level', () => {
    assert.equal(depthOf({ a: 1, b: 2 }), 1);
  });

  it('counts each populated container as a level', () => {
    assert.equal(depthOf({ a: { b: { c: 1 } } }), 3);
    assert.equal(depthOf({ tags: ['a'] }), 2);
  });

  it('counts an empty container as a leaf, matching flattenJson', () => {
    assert.equal(depthOf({ none: [], nothing: {} }), 1);
    assert.equal(depthOf({}), 0);
  });

  it('measures by the deepest branch', () => {
    assert.equal(depthOf({ shallow: 1, deep: { deeper: { deepest: 1 } } }), 3);
  });

  it('handles a container with far more children than fit in an argument list', () => {
    // A spread of one argument per child overflowed the stack here, which threw
    // out of the view's refresh — on a file well under the size it will measure.
    assert.equal(depthOf({ items: new Array(200_000).fill(0) }), 2);
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
