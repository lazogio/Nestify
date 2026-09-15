import * as vscode from 'vscode';
import { Converter, listConverters, requireConverter } from './converters/registry';

// Imported for the side effect: the module registers the JSON converters.
// A new converter module only has to be imported here as well.
import './converters/jsonFlattenConverters';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('nestify.flatten', () => applyConverter(requireConverter('flatten'))),
    vscode.commands.registerCommand('nestify.unflatten', () => applyConverter(requireConverter('unflatten'))),
    vscode.commands.registerCommand('nestify.convert', () => pickAndApplyConverter())
  );
}

export function deactivate(): void {
  // Nothing to clean up.
}

/**
 * Lets the user choose any registered converter. New converters show up here
 * for free, without touching package.json or this file.
 */
async function pickAndApplyConverter(): Promise<void> {
  const converters = listConverters();

  if (converters.length === 0) {
    vscode.window.showErrorMessage('Nestify: no converters are registered.');
    return;
  }

  const picked = await vscode.window.showQuickPick(
    converters.map((converter) => ({
      label: `$(json) ${converter.title}`,
      description: converter.id,
      converter
    })),
    {
      title: 'Nestify',
      placeHolder: 'Choose a conversion to apply to the selection'
    }
  );

  if (picked) {
    await applyConverter(picked.converter);
  }
}

async function applyConverter(converter: Converter): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showErrorMessage('Nestify: open a file first.');
    return;
  }

  const document = editor.document;
  const hadSelection = !editor.selection.isEmpty;

  // Operate on the selection, or on the whole document when nothing is selected.
  const range = hadSelection
    ? new vscode.Range(editor.selection.start, editor.selection.end)
    : new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));

  let converted: string;

  try {
    converted = converter.run(document.getText(range));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Nestify: ${reason}`);
    return;
  }

  const applied = await editor.edit((editBuilder) => editBuilder.replace(range, converted));

  if (!applied) {
    vscode.window.showErrorMessage('Nestify: the editor rejected the edit, nothing was changed.');
    return;
  }

  // Keep the converted text highlighted so it is obvious what changed, and put
  // the cursor at the start of it when the whole document was converted.
  const end = document.positionAt(document.offsetAt(range.start) + converted.length);
  editor.selection = hadSelection
    ? new vscode.Selection(range.start, end)
    : new vscode.Selection(range.start, range.start);
  editor.revealRange(new vscode.Range(range.start, end), vscode.TextEditorRevealType.Default);

  const scope = hadSelection ? 'selection' : 'document';
  vscode.window.setStatusBarMessage(`$(check) Nestify: ${converter.title} applied to the ${scope}`, 3000);
}
