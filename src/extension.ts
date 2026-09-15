import * as vscode from 'vscode';
import { requireConverter } from './converters/registry';

// Importing for the side effect: the module registers the JSON converters.
// Any future converter module just needs to be imported here as well.
import './converters/jsonFlattenConverters';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('nestify.flatten', () => runConverter('flatten')),
    vscode.commands.registerCommand('nestify.unflatten', () => runConverter('unflatten'))
  );
}

export function deactivate(): void {
  // Nothing to clean up.
}

async function runConverter(converterId: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showErrorMessage('Nestify: open a file first.');
    return;
  }

  const document = editor.document;
  const selection = editor.selection;

  // Operate on the selection, or on the whole document when nothing is selected.
  const range = selection.isEmpty
    ? new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length))
    : new vscode.Range(selection.start, selection.end);

  let converted: string;

  try {
    converted = requireConverter(converterId).run(document.getText(range));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Nestify: ${reason}`);
    return;
  }

  const applied = await editor.edit((editBuilder) => editBuilder.replace(range, converted));

  if (!applied) {
    vscode.window.showErrorMessage('Nestify: the editor rejected the edit, nothing was changed.');
  }
}
