import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { envKeyCount, parseEnvText, toEnvText } from '../envFormat';
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

describe('toEnvText', () => {
  it('writes one key=value per line, with JSON values', () => {
    assert.equal(
      toEnvText({ app__name: 'nestify', app__port: 8080, debug: true, nothing: null }),
      'app__name="nestify"\napp__port=8080\ndebug=true\nnothing=null'
    );
  });

  it('keeps an empty container as the leaf it is', () => {
    assert.equal(toEnvText({ none: [], nothing: {} }), 'none=[]\nnothing={}');
  });

  it('quotes a value that would otherwise read as a number', () => {
    // 02134 unquoted comes back as 2134, which is not the zip that was written.
    assert.equal(toEnvText({ zip: '02134' }), 'zip="02134"');
  });

  it('refuses a key holding the "=" that separates a key from its value', () => {
    assert.match(messageFrom(() => toEnvText({ 'a=b': 1 })), /contains "="/);
  });

  it('refuses a document that sets no keys, rather than blanking the file', () => {
    assert.match(messageFrom(() => toEnvText({})), /nothing to write/);
  });

  it('refuses a key that could not be read back off one line', () => {
    assert.match(messageFrom(() => toEnvText({ 'a\nb': 1 })), /contains whitespace/);
    assert.match(messageFrom(() => toEnvText({ ' a ': 1 })), /contains whitespace/);
    assert.match(messageFrom(() => toEnvText({ '#a': 1 })), /marks a comment/);
    assert.match(messageFrom(() => toEnvText({ '': 1 })), /is empty/);
  });

  it('refuses the "export a" a sourced file would read back as "a"', () => {
    assert.match(messageFrom(() => toEnvText({ 'export a': 1 })), /contains whitespace/);
  });

  it('single-quotes a string a shell would expand, which JSON quotes would not', () => {
    // pass="a$USER" reaches docker-compose or `source` as "aroot".
    assert.equal(toEnvText({ pass: 'a$USER' }), "pass='a$USER'");
    assert.equal(toEnvText({ cmd: 'x`id`' }), "cmd='x`id`'");
    // Anything needing an escape still needs JSON to carry it.
    assert.equal(toEnvText({ both: "a$U'b" }), 'both="a$U\'b"');
    assert.equal(toEnvText({ nl: 'a$U\nb' }), 'nl="a$U\\nb"');
  });
});

describe('parseEnvText', () => {
  it('reads back exactly what toEnvText wrote', () => {
    const flat = { a__b: 'x', n: 8080, t: true, z: null, e: {} };

    assert.deepEqual(parseEnvText(toEnvText(flat)), flat);
  });

  it('skips blank lines and comments', () => {
    assert.deepEqual(parseEnvText('\n# a comment\n\nA=1\n  # indented\nB=2\n'), { A: 1, B: 2 });
  });

  it('strips an export prefix, as a sourced file carries', () => {
    assert.deepEqual(parseEnvText('export A=1'), { A: 1 });
  });

  it('splits on the first "=" only, so a value may hold more', () => {
    assert.deepEqual(parseEnvText('URL=postgres://u:p@h/db?a=1'), {
      URL: 'postgres://u:p@h/db?a=1'
    });
  });

  it('reads bare text as the string it spells', () => {
    assert.deepEqual(parseEnvText('NAME=nestify'), { NAME: 'nestify' });
  });

  it('reads single quotes as a shell does, without unescaping', () => {
    assert.deepEqual(parseEnvText("A='say \\n hi'"), { A: 'say \\n hi' });
  });

  it('treats a key set with nothing after the "=" as empty', () => {
    assert.deepEqual(parseEnvText('A='), { A: '' });
  });

  it('refuses a key set twice rather than burying the first value', () => {
    assert.match(messageFrom(() => parseEnvText('A=1\nA=2')), /set twice/);
  });

  it('strips an inline comment from an unquoted value, as dotenv does', () => {
    assert.deepEqual(parseEnvText('PORT=8080 # the port'), { PORT: 8080 });
    // Inside quotes a "#" is part of the value, which is every value Nestify writes.
    assert.deepEqual(parseEnvText('A="a # b"'), { A: 'a # b' });
    assert.deepEqual(parseEnvText('URL=http://h/p#frag'), { URL: 'http://h/p#frag' });
  });

  it('refuses a line whose name holds whitespace, so code is not read as .env', () => {
    assert.match(messageFrom(() => parseEnvText('const a = 1')), /contains whitespace/);
  });

  it('points at the line it refused, so a selection lands on the right one', () => {
    const text = 'A=1\nB=2\njust words';
    let offset: unknown;

    try {
      parseEnvText(text);
    } catch (error) {
      offset = (error as { offset?: number }).offset;
    }

    assert.equal(offset, text.indexOf('just words'));
  });

  it('refuses a line that sets nothing, and text that sets nothing at all', () => {
    assert.match(messageFrom(() => parseEnvText('A=1\njust words')), /sets no value/);
    assert.match(messageFrom(() => parseEnvText('# only a comment')), /nothing to convert/);
  });

  it('keeps a value JSON would round to a different number', () => {
    // The 0.0.8 lesson: 1234567890123456789 parses to 1234567890123456800, so
    // trusting the parse would hand back an id nobody wrote.
    assert.deepEqual(parseEnvText('ID=1234567890123456789'), { ID: '1234567890123456789' });
    assert.deepEqual(parseEnvText('X=1e5'), { X: '1e5' });
    assert.deepEqual(parseEnvText('ZIP=02134'), { ZIP: '02134' });
    assert.deepEqual(parseEnvText('V=1.0'), { V: '1.0' });
  });

  it('still reads a number that survives being written again', () => {
    assert.deepEqual(parseEnvText('N=8080\nF=1.5\nNEG=-3'), { N: 8080, F: 1.5, NEG: -3 });
  });
});

describe('a document through both directions', () => {
  it('survives flatten, write, read and nest unchanged', () => {
    const document = {
      app: { name: 'nestify', port: 8080, tags: ['a', 'b'] },
      api_key: 'sk-1',
      zip: '02134',
      none: []
    };

    const text = toEnvText(flattenJson(document, { separator: '__' }));
    const back = unflattenJson(parseEnvText(text), { separator: '__' });

    assert.deepEqual(back, document);
  });

  it('leaves a snake_case key alone under the default separator', () => {
    // With "_" the key api_key would be refused as holding the separator, which
    // is why the default is "__".
    assert.equal(toEnvText(flattenJson({ api_key: 1 }, { separator: '__' })), 'api_key=1');
  });
});

describe('envKeyCount', () => {
  it('counts the keys env text sets', () => {
    assert.equal(envKeyCount('A=1\n# c\nB=2'), 2);
  });

  it('is undefined for JSON, which is the other thing this reads', () => {
    assert.equal(envKeyCount('{"a":1}'), undefined);
    assert.equal(envKeyCount('[1]'), undefined);
    assert.equal(envKeyCount('"{\\"a\\":1}"'), undefined);
  });

  it('is undefined for prose and for nothing at all', () => {
    assert.equal(envKeyCount('just words'), undefined);
    assert.equal(envKeyCount('   '), undefined);
  });
});
