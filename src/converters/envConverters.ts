import { parseEnvText, toEnvText } from '../envFormat';
import {
  flattenJson,
  NestingConflictError,
  SeparatorConflictError,
  sortKeysDeep,
  unflattenJson
} from '../jsonNesting';
import { readSettings } from '../settings';
import { parseJsonSource } from './jsonSource';
import { ConversionContext, registerConverter } from './registry';

/**
 * Re-words a separator refusal thrown by the nesting core.
 *
 * Those refusals carry a suggestion, which the editor offers as a button that
 * writes `nestify.separator`. That is the wrong setting here: it would change
 * what flatten and nest do while leaving this conversion failing in exactly the
 * same way, since a .env is joined with `nestify.envSeparator`. Rethrown as a
 * plain Error so no button appears, with the reason kept.
 */
function asEnvSeparatorFailure(error: unknown): never {
  if (error instanceof SeparatorConflictError) {
    throw new Error(
      `The key "${error.key}" already contains "${error.separator}", so writing it to a ` +
        '.env would read as a path and could not be read back. Set nestify.envSeparator ' +
        'to something your keys do not contain.'
    );
  }

  if (error instanceof NestingConflictError) {
    throw new Error(
      `${error.message.replace(/^Nestify: /, '')} Change nestify.envSeparator rather than ` +
        'nestify.separator: a .env is joined with its own.'
    );
  }

  throw error;
}

registerConverter({
  id: 'json-to-env',
  title: 'JSON to .env',
  shortTitle: 'To .env',
  hint: '{a:{b}} → a__b=…',
  icon: 'settings-gear',
  example: '// before\n{ "app": { "port": 8080 } }\n\n// after\napp__port=8080',
  skipReason(summary): string | undefined {
    if (summary.envLines) {
      return 'already .env';
    }

    // As with flatten and nest: there are no keys to write until the string is
    // parsed, so offering this row on one would only throw.
    return summary.jsonString ? 'still a string' : undefined;
  },
  run(sourceText: string, context?: ConversionContext): string {
    const { envSeparator, sortKeys } = readSettings(context?.resource);
    const parsed = parseJsonSource(sourceText);

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Writing a .env needs a JSON object or array — got a single scalar value.');
    }

    try {
      // Sorted before flattening rather than after: the lines are written straight
      // from the flat map, so there is no stringify step to sort at.
      const flat = flattenJson(sortKeys ? sortKeysDeep(parsed) : parsed, {
        separator: envSeparator
      });

      return toEnvText(flat);
    } catch (error) {
      asEnvSeparatorFailure(error);
    }
  }
});

registerConverter({
  id: 'env-to-json',
  title: '.env to JSON',
  shortTitle: 'From .env',
  hint: 'a__b=… → {a:{b}}',
  icon: 'symbol-namespace',
  example: '// before\napp__port=8080\n\n// after\n{ "app": { "port": 8080 } }',
  skipReason(summary): string | undefined {
    return summary.envLines === false ? 'not .env' : undefined;
  },
  run(sourceText: string, context?: ConversionContext): string {
    const { envSeparator, indent, arrays, sortKeys } = readSettings(context?.resource);
    const flat = parseEnvText(sourceText);

    try {
      // `unflattenJson` carries the whole refusal machinery: keys that collide,
      // "__proto__", and rebuilding `tags__0` back into the array it came from.
      const nested = unflattenJson(flat, { separator: envSeparator, arrays });

      return JSON.stringify(sortKeys ? sortKeysDeep(nested) : nested, null, indent);
    } catch (error) {
      asEnvSeparatorFailure(error);
    }
  }
});
