import * as vscode from 'vscode';
import { targetEditor, trackActiveEditor } from './activeEditor';
import { Converter, getConverter, listConverters, requireConverter } from './converters/registry';
import { ConverterTreeProvider } from './converterTreeView';

// Imported for the side effect: the module registers the JSON converters.
// A new converter module only has to be imported here as well.
import './converters/jsonFlattenConverters';

export function activate(context: vscode.ExtensionContext): void {
  const converterTree = new ConverterTreeProvider();

  context.subscriptions.push(
    vscode.commands.registerCommand('nestify.flatten', () => applyConverter(requireConverter('flatten'))),
    vscode.commands.registerCommand('nestify.unflatten', () => applyConverter(requireConverter('unflatten'))),
    vscode.commands.registerCommand('nestify.convert', () => pickAndApplyConverter()),
    // Invoked by the Activity Bar view: a row click passes the converter id, the
    // inline run button passes the row's converter itself.
    vscode.commands.registerCommand('nestify.runConverter', (target: string | Converter) =>
      runConverter(target)
    ),
    trackActiveEditor(),
    vscode.window.registerTreeDataProvider('nestify.converters', converterTree),
    // Keep the view's top row honest about what a conversion would act on.
    vscode.window.onDidChangeActiveTextEditor(() => converterTree.refresh()),
    vscode.window.onDidChangeTextEditorSelection(() => converterTree.scheduleRefresh(150)),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document === vscode.window.activeTextEditor?.document) {
        converterTree.scheduleRefresh();
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('nestify.separator')) {
        converterTree.refresh();
      }
    }),
    converterTree
  );
}

export function deactivate(): void {
  // Nothing to clean up.
}

/**
 * Runs a converter given either its id or the converter itself. Reports a
 * readable message instead of throwing on an unknown id, since the caller is a
 * UI element rather than code.
 */
async function runConverter(target: string | Converter): Promise<void> {
  if (typeof target !== 'string') {
    await applyConverter(target);
    return;
  }

  const converter = getConverter(target);

  if (!converter) {
    vscode.window.showErrorMessage(`Nestify: no converter registered for "${target}".`);
    return;
  }

  await applyConverter(converter);
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
      label: converter.title,
      description: converter.hint,
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
  const editor = targetEditor();

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
