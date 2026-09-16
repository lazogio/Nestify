import * as vscode from 'vscode';
import { targetEditor } from './activeEditor';
import { depthOf, flattenJson } from './jsonNesting';

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
  let keyCount: number;
  let depth: number;

  try {
    keyCount = Object.keys(flattenJson(parsed, { separator })).length;
    depth = depthOf(parsed);
  } catch (error) {
    // Valid JSON that still cannot be flattened, such as two keys that join to
    // the same path. Saying so here beats a count the conversion would refuse.
    if (error instanceof Error && error.message.startsWith('Nestify: ')) {
      return { problem: asSentence(error) };
    }

    // Something the measurement itself could not carry, such as nesting deep
    // enough to exhaust the stack. A conversion may still work, so the view
    // says only that it cannot measure instead of standing in the way. This
    // runs on every keystroke, so it must never throw into the event loop.
    return { headerDetail: `${scope} · too large to measure` };
  }

  const keys = `${keyCount} ${keyCount === 1 ? 'key' : 'keys'}`;
  const nesting = depth <= 1 ? 'flat' : `${depth} levels deep`;

  return {
    // The file name is already on the editor tab, so this spends its width on
    // the two numbers a conversion changes.
    headerDetail: hasSelection ? `Selection: ${keys} · ${nesting}` : `${keys} · ${nesting}`,
    shape: depth <= 1 ? 'flat' : 'nested'
  };
}

/** Turns a thrown Nestify error into prose the view can show above the list. */
function asSentence(error: Error): string {
  const message = error.message.replace(/^Nestify: /, '');
  return message.charAt(0).toUpperCase() + message.slice(1);
}
