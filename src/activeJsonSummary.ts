import * as vscode from 'vscode';
import { flattenJson } from './jsonNesting';

/** What the view says about the text a conversion would run on. */
export interface ActiveJsonSummary {
  /** What is being measured: a file name, or a file name marked as a selection. */
  readonly label: string;
  /** The shape of that text, or why it cannot be measured. */
  readonly detail: string;
  /** A codicon id reflecting whether Nestify could run right now. */
  readonly icon: string;
  /** True when the text parses as a JSON object or array. */
  readonly convertible: boolean;
}

// Parsing runs on every keystroke in the active file, so skip pathological sizes.
const MAX_ANALYSED_CHARS = 500_000;

/**
 * Describes the text a conversion would act on: the selection when there is
 * one, the whole file otherwise. Mirrors how `applyConverter` picks its range,
 * so the view cannot claim something the commands would not do.
 */
export function summariseActiveJson(): ActiveJsonSummary {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    return {
      label: 'No file open',
      detail: 'open JSON to convert it',
      icon: 'circle-slash',
      convertible: false
    };
  }

  const document = editor.document;
  const hasSelection = !editor.selection.isEmpty;
  const text = hasSelection ? document.getText(editor.selection) : document.getText();
  const label = hasSelection ? `${fileNameOf(document)} — selection` : fileNameOf(document);

  if (text.trim().length === 0) {
    return { label, detail: 'nothing to convert', icon: 'circle-slash', convertible: false };
  }

  if (text.length > MAX_ANALYSED_CHARS) {
    return { label, detail: 'too large to preview', icon: 'file', convertible: true };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(text.trim());
  } catch {
    return { label, detail: 'not valid JSON', icon: 'warning', convertible: false };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { label, detail: 'a single value, not an object', icon: 'warning', convertible: false };
  }

  return { label, detail: describeShape(parsed), icon: 'symbol-namespace', convertible: true };
}

/** Reads as "12 keys · 3 levels deep", the two numbers a conversion changes. */
function describeShape(parsed: object): string {
  const separator = vscode.workspace.getConfiguration('nestify').get<string>('separator', '.') || '.';
  const keyCount = Object.keys(flattenJson(parsed, { separator })).length;
  const depth = depthOf(parsed);

  const keys = `${keyCount} ${keyCount === 1 ? 'key' : 'keys'}`;

  return depth <= 1 ? `${keys} · flat` : `${keys} · ${depth} levels deep`;
}

/** 1 for a flat object, 2 once a value is itself an object, and so on. */
function depthOf(value: unknown): number {
  if (typeof value !== 'object' || value === null) {
    return 0;
  }

  const children = Object.values(value as Record<string, unknown>);

  if (children.length === 0) {
    return 1;
  }

  return 1 + Math.max(0, ...children.map(depthOf));
}

function fileNameOf(document: vscode.TextDocument): string {
  if (document.isUntitled) {
    return 'Untitled';
  }

  return document.fileName.split('/').pop() ?? document.fileName;
}
