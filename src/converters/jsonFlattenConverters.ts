import {
  flattenJson,
  NestingConflictError,
  sortKeysDeep,
  suggestNestingSeparator,
  unflattenJson
} from '../jsonNesting';
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

    refuseIfNothingToNest(parsed, separator, arrays);

    return stringify(unflattenJson(parsed, { separator, arrays }), indent, sortKeys);
  }
});

/**
 * Refuses a nesting that would hand the file back exactly as it came, when the
 * keys are plainly joined with something else.
 *
 * A separator none of the keys contain splits nothing, so the conversion
 * "succeeded" while changing only the indentation — the same silence as a
 * broken command. It is only worth saying when another separator would really
 * nest the document: a file that is already nested has nothing to do either
 * way, and saying so on every press would be noise.
 */
function refuseIfNothingToNest(
  parsed: object,
  separator: string,
  arrays: 'rebuild' | 'objects'
): void {
  if (Object.keys(parsed).some((key) => key.includes(separator))) {
    return;
  }

  const suggestion = suggestNestingSeparator(parsed, { arrays }, separator);

  if (suggestion === undefined) {
    return;
  }

  throw new NestingConflictError(
    `Nestify: no key here contains the separator "${separator}", so nesting would ` +
      `leave the file as it is. These keys are joined with "${suggestion}".`,
    separator,
    suggestion
  );
}
