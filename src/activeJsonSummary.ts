import * as vscode from 'vscode';
import { targetEditor } from './activeEditor';
import { flattenJson } from './jsonNesting';

/** What the view knows about the text a conversion would run on. */
export interface ActiveJsonSummary {
  /** The shape of that text, e.g. "66 keys · 10 levels deep". */
  readonly headerDetail?: string;
  /** Prose shown above the list when nothing can be converted. */
  readonly problem?: string;
  /** Whether that text is already flat, nested, or unknown. */
  readonly shape?: 'flat' | 'nested';
}

// Parsing runs on every keystroke in the active file, so skip pathological sizes.
const MAX_ANALYSED_CHARS = 500_000;

/**
 * Describes the text a conversion would act on: the selection when there is
 * one, the whole file otherwise. Mirrors how `applyConverter` picks its range,
 * so the view cannot claim something the commands would not do.
 */
export function summariseActiveJson(): ActiveJsonSummary {
  const editor = targetEditor();

  if (!editor) {
    return { problem: 'Open a JSON file to convert it.' };
  }

  const document = editor.document;
  const hasSelection = !editor.selection.isEmpty;
  const text = hasSelection ? document.getText(editor.selection) : document.getText();
  const scope = hasSelection ? 'selection' : 'file';

  if (text.trim().length === 0) {
    return { problem: `The ${scope} is empty.` };
  }

  if (text.length > MAX_ANALYSED_CHARS) {
    return { headerDetail: `${scope} · too large to measure` };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(text.trim());
  } catch {
    return { problem: `The ${scope} is not valid JSON.` };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { problem: `The ${scope} is a single value, not an object or array.` };
  }

  const separator = vscode.workspace.getConfiguration('nestify').get<string>('separator', '.') || '.';
  const keyCount = Object.keys(flattenJson(parsed, { separator })).length;
  const depth = depthOf(parsed);
  const keys = `${keyCount} ${keyCount === 1 ? 'key' : 'keys'}`;
  const nesting = depth <= 1 ? 'flat' : `${depth} levels deep`;

  return {
    // The file name is already on the editor tab, so this spends its width on
    // the two numbers a conversion changes.
    headerDetail: hasSelection ? `Selection: ${keys} · ${nesting}` : `${keys} · ${nesting}`,
    shape: depth <= 1 ? 'flat' : 'nested'
  };
}

/**
 * 1 for a flat object, 2 once a value is itself a populated object, and so on.
 *
 * An empty object or array counts as a leaf, not a level, because that is how
 * `flattenJson` treats it. Counting it as a level made a visibly flat file
 * report "2 levels deep" over a single `[]`.
 */
function depthOf(value: unknown): number {
  if (typeof value !== 'object' || value === null) {
    return 0;
  }

  const children = Object.values(value as Record<string, unknown>);

  if (children.length === 0) {
    return 0;
  }

  return 1 + Math.max(0, ...children.map(depthOf));
}
