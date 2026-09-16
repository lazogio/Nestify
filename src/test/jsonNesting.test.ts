import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  countFlatKeys,
  depthOf,
  flattenJson,
  NestingConflictError,
  SeparatorConflictError,
  sortKeysDeep,
  suggestedSeparator,
  suggestNestingSeparator,
  suggestSeparator,
  unflattenJson
} from '../jsonNesting';

/** The error itself, for the fields the editor reads off it. */
function errorFrom(run: () => unknown): SeparatorConflictError {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof SeparatorConflictError, 'expected a SeparatorConflictError');
    return error;
  }

  assert.fail('expected the call to throw');
}

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

  describe('keys that already contain the separator', () => {
    it('refuses one, since nesting would read it as a path', () => {
      const message = messageFrom(() => flattenJson(JSON.parse('{"a.b": 1}')));

      assert.match(message, /"a\.b" already contains the separator "\."/);
      assert.match(message, /could not be nested back/);
    });

    it('refuses one nested inside the document', () => {
      // Flattening this produced "app.v1.2.x", which nested back as four levels
      // rather than the three that were written.
      assert.throws(() => flattenJson(JSON.parse('{"app": {"v1.2": {"x": 1}}}')), SyntaxError);
    });

    it('refuses the pair that would have collided', () => {
      assert.throws(() => flattenJson(JSON.parse('{"a.b": 1, "a": {"b": 2}}')), SyntaxError);
    });

    it('allows the same keys once the separator no longer occurs in them', () => {
      assert.deepEqual(flattenJson({ 'a.b': 1, a: { b: 2 } }, { separator: '/' }), {
        'a.b': 1,
        'a/b': 2
      });
    });

    it('leaves an ordinary document alone', () => {
      assert.deepEqual(flattenJson({ app: { name: 'nestify' } }), { 'app.name': 'nestify' });
    });
  });

  describe('two paths that join to the same key', () => {
    // A separator of more than one character can be split across two segments
    // that neither of them contains, which the check above cannot see.
    const separator = '..';

    it('refuses the second path, naming both', () => {
      const message = messageFrom(() =>
        flattenJson(JSON.parse('{"a.": {"b": 1}, "a": {".b": 2}}'), { separator })
      );

      assert.match(message, /"a\.\.\.b" would be written twice/);
      assert.match(message, /"a\." → "b" and "a" → "\.b"/);
    });

    it('refuses it whichever side comes first', () => {
      assert.throws(
        () => flattenJson(JSON.parse('{"a": {".b": 2}, "a.": {"b": 1}}'), { separator }),
        SyntaxError
      );
    });
  });

  describe('keys that could not be nested back', () => {
    it('refuses a "__proto__" key instead of stranding it in flat form', () => {
      // JSON.parse is how the extension gets here, and it makes "__proto__" an
      // ordinary own key — unlike an object literal, which sets the prototype.
      const message = messageFrom(() => flattenJson(JSON.parse('{"__proto__": {"polluted": true}}')));

      assert.match(message, /__proto__/);
      assert.match(message, /cannot be nested back/);
      assert.equal(({} as Record<string, unknown>).polluted, undefined);
    });

    it('refuses one deeper in the path too', () => {
      assert.throws(() => flattenJson(JSON.parse('{"a": {"__proto__": {"b": 1}}}')), SyntaxError);
    });

    it('refuses an empty key segment', () => {
      const message = messageFrom(() => flattenJson(JSON.parse('{"": {"a": 1}}')));

      assert.match(message, /segments is empty/);
    });

    it('carries "constructor" and "prototype", which are ordinary keys', () => {
      assert.deepEqual(flattenJson(JSON.parse('{"constructor": {"name": "Widget"}}')), {
        'constructor.name': 'Widget'
      });
    });
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

  describe('index keys', () => {
    it('rebuilds the array they were flattened from', () => {
      assert.deepEqual(unflattenJson({ 'tags.0': 'a', 'tags.1': 'b' }), { tags: ['a', 'b'] });
    });

    it('rebuilds one that arrived out of order', () => {
      assert.deepEqual(unflattenJson({ 'tags.1': 'b', 'tags.0': 'a' }), { tags: ['a', 'b'] });
    });

    it('rebuilds an array at the top level', () => {
      assert.deepEqual(unflattenJson({ '0': 'a', '1': 'b' }), ['a', 'b']);
    });

    it('leaves a gap as an object, no array being able to hold it', () => {
      assert.deepEqual(unflattenJson({ 'tags.0': 'a', 'tags.2': 'c' }), {
        tags: { 0: 'a', 2: 'c' }
      });
    });

    it('leaves keys that only look like indices', () => {
      assert.deepEqual(unflattenJson({ 'tags.01': 'a' }), { tags: { '01': 'a' } });
      assert.deepEqual(unflattenJson({ 'tags.1': 'b' }), { tags: { 1: 'b' } });
    });

    it('keeps every container an object when asked to', () => {
      assert.deepEqual(unflattenJson({ 'tags.0': 'a' }, { arrays: 'objects' }), {
        tags: { 0: 'a' }
      });
    });

    it('leaves a value that was already an object alone', () => {
      // The value came verbatim from the flat document, so it is not Nestify's
      // to reshape — only the containers nesting itself built are.
      assert.deepEqual(unflattenJson({ 'a.b': { 0: 'x' } }), { a: { b: { 0: 'x' } } });
    });
  });

  it('honours a custom separator', () => {
    assert.deepEqual(unflattenJson({ 'a/b': 1 }, { separator: '/' }), { a: { b: 1 } });
  });

  it('refuses an empty path segment', () => {
    assert.throws(() => unflattenJson({ 'a..b': 1 }), SyntaxError);
  });

  it('refuses the one reserved path segment', () => {
    assert.throws(() => unflattenJson({ ['__proto__.x']: 1 }), SyntaxError);
    assert.throws(() => unflattenJson({ ['a.__proto__.b']: 1 }), SyntaxError);
  });

  it('rebuilds "constructor" and "prototype" like any other key', () => {
    assert.deepEqual(unflattenJson({ ['a.constructor']: 1 }), { a: { constructor: 1 } });
    assert.deepEqual(unflattenJson({ ['prototype.b']: 1 }), { prototype: { b: 1 } });
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

  it('refuses to merge into a value that is itself an object', () => {
    // It used to descend into it, so the key landed inside data the document
    // supplied — and the caller's own object was rewritten in the process.
    const input = JSON.parse('{"a": {"b": 1}, "a.c": 2}');

    assert.throws(() => unflattenJson(input), SyntaxError);
    assert.deepEqual(input, { a: { b: 1 }, 'a.c': 2 });
  });

  it('leaves the object it was given untouched', () => {
    const input = { 'a.b': 1, 'a.c': 2 };
    const before = JSON.parse(JSON.stringify(input));

    unflattenJson(input);

    assert.deepEqual(input, before);
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

describe('countFlatKeys', () => {
  it('counts what flattening would write', () => {
    const document = { app: { name: 'nestify', tags: ['a', 'b'] }, empty: {} };

    assert.equal(countFlatKeys(document), Object.keys(flattenJson(document)).length);
    assert.equal(countFlatKeys(document), 4);
  });

  it('counts nothing for a wholly empty document', () => {
    assert.equal(countFlatKeys({}), 0);
  });

  it('honours the separator, which decides what clashes', () => {
    assert.equal(countFlatKeys({ 'a.b': 1, a: { b: 2 } }, { separator: '/' }), 2);
  });

  it('refuses whatever flattening would refuse', () => {
    assert.throws(() => countFlatKeys(JSON.parse('{"a.b": 1}')), SyntaxError);
    assert.throws(() => countFlatKeys('nope'), TypeError);
  });
});

describe('sortKeysDeep', () => {
  it("puts an object's keys in order", () => {
    assert.deepEqual(Object.keys(sortKeysDeep({ b: 1, a: 2, c: 3 }) as object), ['a', 'b', 'c']);
  });

  it('reaches every level', () => {
    const sorted = sortKeysDeep({ b: { d: 1, c: 2 }, a: 3 }) as Record<string, object>;

    assert.deepEqual(Object.keys(sorted), ['a', 'b']);
    assert.deepEqual(Object.keys(sorted.b), ['c', 'd']);
  });

  it('leaves an array in the order it was written', () => {
    assert.deepEqual(sortKeysDeep({ tags: ['c', 'a', 'b'] }), { tags: ['c', 'a', 'b'] });
  });

  it('sorts inside the objects an array holds', () => {
    const sorted = sortKeysDeep([{ b: 1, a: 2 }]) as Record<string, unknown>[];

    assert.deepEqual(Object.keys(sorted[0]), ['a', 'b']);
  });

  it('changes no value, only the order', () => {
    const original = { b: 1, a: [{ d: null, c: false }] };

    assert.deepEqual(sortKeysDeep(original), original);
  });

  it('passes a scalar straight through', () => {
    assert.equal(sortKeysDeep('nestify'), 'nestify');
    assert.equal(sortKeysDeep(null), null);
  });
});

describe('round trips', () => {
  it('returns objects unchanged when they hold no arrays', () => {
    const original = { app: { name: 'nestify', window: { width: 800 } }, debug: false };

    assert.deepEqual(unflattenJson(flattenJson(original)), original);
  });

  it('returns a document whose keys are named after built-ins unchanged', () => {
    const original = JSON.parse('{"constructor": {"name": "Widget"}, "prototype": {"x": 1}}');

    assert.deepEqual(unflattenJson(flattenJson(original)), original);
  });

  it('returns arrays unchanged too', () => {
    const original = { tags: ['a', 'b'], nested: { items: [{ id: 1 }] } };

    assert.deepEqual(unflattenJson(flattenJson(original)), original);
  });

  it('returns objects of index-like keys as arrays, the one shape it cannot tell apart', () => {
    assert.deepEqual(unflattenJson(flattenJson({ lookup: { 0: 'a' } })), { lookup: ['a'] });
    assert.deepEqual(unflattenJson(flattenJson({ lookup: { 0: 'a' } }), { arrays: 'objects' }), {
      lookup: { 0: 'a' }
    });
  });
});

describe('the separator a refused document could use', () => {
  it('rides the refusal, so the editor can offer it', () => {
    const error = errorFrom(() => flattenJson(JSON.parse('{"app.title": "Hi"}')));

    assert.ok(error instanceof SeparatorConflictError);
    assert.equal(error.key, 'app.title');
    assert.equal(error.separator, '.');
    assert.equal(error.suggestion, '/');
    assert.match(error.message, /No key here contains "\/"/);
  });

  it('skips a candidate the document already uses', () => {
    assert.equal(suggestSeparator({ 'a.b': 1, 'c/d': 2 }), '_');
  });

  it('reads every key, not only the one that was refused', () => {
    // The offer has to hold for the whole document: "/" is free at the top and
    // taken further down, so suggesting it would refuse again on the next key.
    assert.equal(suggestSeparator({ 'a.b': 1, nested: { 'c/d': 2 } }), '_');
  });

  it('looks inside arrays, whose items carry keys of their own', () => {
    assert.equal(suggestSeparator({ rows: [{ 'a/b': 1 }] }), '_');
  });

  it('never offers the separator that was just refused', () => {
    assert.notEqual(suggestSeparator({ 'a/b': 1 }, '/'), '/');
  });

  it('offers nothing, and says so, when every candidate occurs', () => {
    const keys = JSON.parse(
      '{"a.b": 1, "c/d": 2, "e_f": 3, "g:h": 4, "i|j": 5, "k~l": 6, "m::n": 7, "o->p": 8}'
    );

    assert.equal(suggestSeparator(keys), undefined);

    const message = messageFrom(() => flattenJson(keys));

    assert.match(message, /Set the separator to a character your keys do not contain/);
  });

  it('offers nothing when no separator could rescue the document', () => {
    // "__proto__" is refused whatever the separator, so a button offering one
    // would fail on the next press.
    const document = JSON.parse('{"a.b": 1, "__proto__": {"x": 2}}');

    assert.equal(suggestSeparator(document, '.'), undefined);
  });

  it('offers one that flattens and nests back without complaint', () => {
    const document = JSON.parse('{"app.title": "Hi", "app": {"sub": "Yo"}}');
    const separator = suggestSeparator(document, '.');

    assert.ok(separator);

    const flat = flattenJson(document, { separator });

    assert.deepEqual(unflattenJson(flat, { separator }), document);
  });
});

describe('the separator keys refused by nesting are actually joined with', () => {
  // Every .NET appsettings.json has this shape: paths joined with ":", and a
  // last segment that is a namespace full of dots. Under "." the namespace
  // splits and collides with the key beside it.
  const appsettings = Object.freeze({
    'Serilog:MinimumLevel:Default': 'Information',
    'Serilog:MinimumLevel:Override:Microsoft': 'Warning',
    'Serilog:MinimumLevel:Override:Microsoft.Extensions.Diagnostics.HealthChecks': 'Warning'
  });

  it('rides the refusal, so the editor can offer it', () => {
    let thrown: unknown;

    try {
      unflattenJson(appsettings);
    } catch (error) {
      thrown = error;
    }

    assert.ok(thrown instanceof NestingConflictError);
    assert.equal(thrown.suggestion, ':');
    assert.equal(suggestedSeparator(thrown), ':');
    assert.match(thrown.message, /conflicts with an earlier key/);
    assert.match(thrown.message, /with ":" instead converts cleanly/);
  });

  it('offers one the document nests cleanly under', () => {
    assert.deepEqual(unflattenJson(appsettings, { separator: ':' }), {
      Serilog: {
        MinimumLevel: {
          Default: 'Information',
          Override: {
            Microsoft: 'Warning',
            'Microsoft.Extensions.Diagnostics.HealthChecks': 'Warning'
          }
        }
      }
    });
  });

  it('never offers one absent from the keys, which would nest nothing', () => {
    // "/" splits none of these, so nesting under it leaves the file as it is.
    assert.notEqual(suggestNestingSeparator(appsettings, {}, '.'), '/');
  });

  it('prefers the separator that splits the most keys', () => {
    const document = { 'a_b': 1, 'c:d': 2, 'e:f': 3, 'g:h': 4 };

    assert.equal(suggestNestingSeparator(document, {}, '.'), ':');
  });

  it('offers nothing when the keys are genuinely duplicated', () => {
    // Not a separator problem: these two say different things about "a.b".
    assert.equal(suggestNestingSeparator({ 'a.b': 1, a: { b: 2 } }, {}, '.'), undefined);
  });

  it('offers nothing for a refusal no separator can clear', () => {
    assert.equal(suggestNestingSeparator({ '__proto__.x': 1 }, {}, '.'), undefined);
  });

  it('leaves a document that nests cleanly alone', () => {
    assert.deepEqual(unflattenJson({ 'a.b': 1, 'a.c': 2 }), { a: { b: 1, c: 2 } });
  });
});
