import * as vscode from 'vscode';

let remembered: vscode.TextEditor | undefined;

/**
 * Remembers the last text editor that was active.
 *
 * Clicking a row in the Activity Bar view moves focus to the view, and
 * `window.activeTextEditor` can be undefined while a view holds focus. Without
 * this the sidebar would refuse to convert the file the user is looking at.
 */
export function trackActiveEditor(): vscode.Disposable {
  remembered = vscode.window.activeTextEditor;

  return vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) {
      remembered = editor;
    }
  });
}

/** The editor a conversion should act on, or `undefined` when none is open. */
export function targetEditor(): vscode.TextEditor | undefined {
  const active = vscode.window.activeTextEditor;

  if (active) {
    return active;
  }

  // Only trust the remembered editor while its document is still on screen.
  if (remembered && vscode.window.visibleTextEditors.includes(remembered)) {
    return remembered;
  }

  return undefined;
}

/** The text a conversion reads, and where it sits. */
export interface ConversionTarget {
  readonly editor: vscode.TextEditor;
  readonly range: vscode.Range;
  readonly hadSelection: boolean;
}

/**
 * The selection, or the whole document when nothing is selected.
 *
 * Both the commands and the Activity Bar header ask this, so that the header
 * cannot describe something a conversion would not act on.
 */
export function conversionTarget(): ConversionTarget | undefined {
  const editor = targetEditor();

  if (!editor) {
    return undefined;
  }

  const hadSelection = !editor.selection.isEmpty;

  // Built from the line count rather than from `getText().length`, which would
  // copy the whole document just to measure it.
  const range = hadSelection
    ? new vscode.Range(editor.selection.start, editor.selection.end)
    : editor.document.validateRange(new vscode.Range(0, 0, editor.document.lineCount, 0));

  return { editor, range, hadSelection };
}
