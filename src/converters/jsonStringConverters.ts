import { sortKeysDeep } from '../jsonNesting';
import { parseEmbeddedJson, toJsonStringLiteral } from '../jsonString';
import { readSettings } from '../settings';
import { parseJsonSource } from './jsonSource';
import { ConversionContext, registerConverter } from './registry';

registerConverter({
  id: 'parse-string',
  title: 'Parse JSON String',
  shortTitle: 'Parse',
  hint: '"{\\"a\\":1}" → {a:1}',
  icon: 'json',
  example:
    '// before\n"{\\"app\\":{\\"name\\":\\"nestify\\"}}"\n\n// after\n{ "app": { "name": "nestify" } }',
  skipReason(summary): string | undefined {
    return summary.jsonString === false ? 'not a JSON string' : undefined;
  },
  run(sourceText: string, context?: ConversionContext): string {
    const { indent, sortKeys } = readSettings(context?.resource);
    const parsed = parseEmbeddedJson(sourceText);

    return JSON.stringify(sortKeys ? sortKeysDeep(parsed) : parsed, null, indent);
  }
});

registerConverter({
  id: 'stringify',
  title: 'Stringify JSON',
  shortTitle: 'Stringify',
  hint: '{a:1} → "{\\"a\\":1}"',
  icon: 'quote',
  example:
    '// before\n{ "app": { "name": "nestify" } }\n\n// after\n"{\\"app\\":{\\"name\\":\\"nestify\\"}}"',
  run(sourceText: string, context?: ConversionContext): string {
    // No indent here, unlike every other converter: the result is one string
    // meant to sit inside another document, where an indented body would come
    // back as a run of "\n" to read around.
    const { sortKeys } = readSettings(context?.resource);
    const parsed = parseJsonSource(sourceText);

    return toJsonStringLiteral(sortKeys ? sortKeysDeep(parsed) : parsed);
  }
});
