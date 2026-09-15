import * as vscode from 'vscode';
import { flattenJson, unflattenJson } from '../jsonNesting';
import { registerConverter } from './registry';

interface NestifySettings {
  separator: string;
  indent: number;
}

function readSettings(): NestifySettings {
  const config = vscode.workspace.getConfiguration('nestify');
  const separator = config.get<string>('separator', '.');
  const indent = config.get<number>('indent', 2);

  return {
    separator: typeof separator === 'string' && separator.length > 0 ? separator : '.',
    indent: Number.isFinite(indent) && indent >= 0 ? Math.floor(indent) : 2
  };
}

function parseJson(sourceText: string): unknown {
  const trimmed = sourceText.trim();

  if (trimmed.length === 0) {
    throw new Error('There is nothing to convert — the selection is empty.');
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`The selected text is not valid JSON: ${reason}`);
  }
}

function stringify(value: unknown, indent: number): string {
  return JSON.stringify(value, null, indent);
}

registerConverter({
  id: 'flatten',
  title: 'Flatten JSON',
  shortTitle: 'Flatten',
  hint: '{"a":{"b":2}} → {"a.b":2}',
  run(sourceText: string): string {
    const { separator, indent } = readSettings();
    const parsed = parseJson(sourceText);

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Flattening needs a JSON object or array — got a single scalar value.');
    }

    return stringify(flattenJson(parsed, { separator }), indent);
  }
});

registerConverter({
  id: 'unflatten',
  title: 'Unflatten (Nest) JSON',
  shortTitle: 'Nest',
  hint: '{"a.b":2} → {"a":{"b":2}}',
  run(sourceText: string): string {
    const { separator, indent } = readSettings();
    const parsed = parseJson(sourceText);

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Unflattening needs a flat JSON object whose keys are joined key paths.');
    }

    return stringify(unflattenJson(parsed, { separator }), indent);
  }
});
