import { flattenJson, sortKeysDeep, unflattenJson } from '../jsonNesting';
import { readSettings } from '../settings';
import { parseJsonSource } from './jsonSource';
import { ConversionContext, registerConverter } from './registry';

function stringify(value: unknown, indent: number, sortKeys: boolean): string {
  return JSON.stringify(sortKeys ? sortKeysDeep(value) : value, null, indent);
}

registerConverter({
  id: 'flatten',
  title: 'Flatten JSON',
  shortTitle: 'Flatten',
  hint: '{a:{b}} → {a.b}',
  icon: 'list-flat',
  example: '// before\n{ "app": { "name": "nestify" } }\n\n// after\n{ "app.name": "nestify" }',
  skipReason(summary): string | undefined {
    return summary.shape === 'flat' ? 'already flat' : undefined;
  },
  run(sourceText: string, context?: ConversionContext): string {
    const { separator, indent, sortKeys } = readSettings(context?.resource);
    const parsed = parseJsonSource(sourceText);

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Flattening needs a JSON object or array — got a single scalar value.');
    }

    return stringify(flattenJson(parsed, { separator }), indent, sortKeys);
  }
});

registerConverter({
  id: 'unflatten',
  title: 'Unflatten (Nest) JSON',
  shortTitle: 'Nest',
  hint: '{a.b} → {a:{b}}',
  icon: 'list-tree',
  example: '// before\n{ "app.name": "nestify" }\n\n// after\n{ "app": { "name": "nestify" } }',
  skipReason(summary): string | undefined {
    return summary.joinedKeys === false ? 'no joined keys' : undefined;
  },
  run(sourceText: string, context?: ConversionContext): string {
    const { separator, indent, arrays, sortKeys } = readSettings(context?.resource);
    const parsed = parseJsonSource(sourceText);

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Unflattening needs a flat JSON object whose keys are joined key paths.');
    }

    return stringify(unflattenJson(parsed, { separator, arrays }), indent, sortKeys);
  }
});
