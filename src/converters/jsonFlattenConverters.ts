import * as vscode from 'vscode';
import { flattenJson, sortKeysDeep, unflattenJson } from '../jsonNesting';
import { parseJsonSource } from './jsonSource';
import { registerConverter } from './registry';

interface NestifySettings {
  separator: string;
  indent: number;
  arrays: 'rebuild' | 'objects';
  sortKeys: boolean;
}

function readSettings(): NestifySettings {
  const config = vscode.workspace.getConfiguration('nestify');
  const separator = config.get<string>('separator', '.');
  const indent = config.get<number>('indent', 2);
  const arrays = config.get<string>('arrays', 'rebuild');

  return {
    separator: typeof separator === 'string' && separator.length > 0 ? separator : '.',
    indent: Number.isFinite(indent) && indent >= 0 ? Math.floor(indent) : 2,
    arrays: arrays === 'objects' ? 'objects' : 'rebuild',
    sortKeys: config.get<boolean>('sortKeys', false) === true
  };
}

function stringify(value: unknown, indent: number, sortKeys: boolean): string {
  return JSON.stringify(sortKeys ? sortKeysDeep(value) : value, null, indent);
}

registerConverter({
  id: 'flatten',
  title: 'Flatten JSON',
  shortTitle: 'Flatten',
  hint: '{a:{b}} → {a.b}',
  run(sourceText: string): string {
    const { separator, indent, sortKeys } = readSettings();
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
  run(sourceText: string): string {
    const { separator, indent, arrays, sortKeys } = readSettings();
    const parsed = parseJsonSource(sourceText);

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Unflattening needs a flat JSON object whose keys are joined key paths.');
    }

    return stringify(unflattenJson(parsed, { separator, arrays }), indent, sortKeys);
  }
});
