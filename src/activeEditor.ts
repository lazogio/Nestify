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
