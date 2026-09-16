import * as vscode from 'vscode';
import { targetEditor, trackActiveEditor } from './activeEditor';
import { ConversionError } from './converters/jsonSource';
import { Converter, getConverter, listConverters, requireConverter } from './converters/registry';
import { ConverterTreeProvider } from './converterTreeView';

// Imported for the side effect: the module registers the JSON converters.
// A new converter module only has to be imported here as well.
import './converters/jsonFlattenConverters';

export function activate(context: vscode.ExtensionContext): void {
  const converterTree = new ConverterTreeProvider();
  const view = vscode.window.createTreeView('nestify.converters', {
    treeDataProvider: converterTree
  });

  syncHeader(view, converterTree);

  context.subscriptions.push(
    vscode.commands.registerCommand('nestify.flatten', () => applyConverter(requireConverter('flatten'))),
    vscode.commands.registerCommand('nestify.unflatten', () => applyConverter(requireConverter('unflatten'))),
    vscode.commands.registerCommand('nestify.convert', () => pickAndApplyConverter()),
    // Invoked by the Activity Bar view, which passes the row's converter id.
    vscode.commands.registerCommand('nestify.runConverter', (target: string | Converter) =>
      runConverter(target)
    ),
    // From the view's row action with that row's converter, from the palette
    // without one, in which case it asks.
    vscode.commands.registerCommand('nestify.copyConverted', (target?: string | Converter) =>
      copyConverted(target)
    ),
    trackActiveEditor(),
    view,
    // The header carries the state; the rows stay a list of actions.
    converterTree.onDidChangeTreeData(() => syncHeader(view, converterTree)),
    // Keep the header honest about what a conversion would act on.
    vscode.window.onDidChangeActiveTextEditor(() => converterTree.refresh()),
    vscode.window.onDidChangeTextEditorSelection(() => converterTree.scheduleRefresh(150)),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document === targetEditor()?.document) {
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

/**
 * States what a conversion would act on, above the list of actions.
 *
 * `view.description` is not an option here: a container holding a single view
 * hides that view's own title bar, so only the container title shows and the
 * description never renders. `view.message` sits above the rows and does show.
 */
function syncHeader(view: vscode.TreeView<Converter>, provider: ConverterTreeProvider): void {
  const summary = provider.currentSummary();

  view.message = summary.problem ?? summary.headerDetail;
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
  const converter = converterFor(target);

  if (converter) {
    await applyConverter(converter);
  }
}

/**
 * Lets the user choose any registered converter. New converters show up here
 * for free, without touching package.json or this file.
 */
async function pickConverter(placeHolder: string): Promise<Converter | undefined> {
  const converters = listConverters();

  if (converters.length === 0) {
    vscode.window.showErrorMessage('Nestify: no converters are registered.');
    return undefined;
  }

  const picked = await vscode.window.showQuickPick(
    converters.map((converter) => ({
      label: converter.title,
      description: converter.hint,
      converter
    })),
    { title: 'Nestify', placeHolder }
  );

  return picked?.converter;
}

async function pickAndApplyConverter(): Promise<void> {
  const converter = await pickConverter('Choose a conversion to apply to the selection');

  if (converter) {
    await applyConverter(converter);
  }
}

/**
 * Writes the conversion to the clipboard, leaving the file alone — for pasting
 * a flattened copy somewhere else, or for looking before leaping.
 */
async function copyConverted(target?: string | Converter): Promise<void> {
  const converter =
    target === undefined
      ? await pickConverter('Choose a conversion to copy to the clipboard')
      : converterFor(target);

  if (!converter) {
    return;
  }

  const where = conversionTarget();

  if (!where) {
    return;
  }

  const converted = convert(converter, where);

  if (converted === undefined) {
    return;
  }

  await vscode.env.clipboard.writeText(converted);

  const scope = where.hadSelection ? 'selection' : 'document';
  vscode.window.setStatusBarMessage(
    `$(clippy) Nestify: ${converter.title} of the ${scope} copied to the clipboard`,
    3000
  );
}

/** The converter behind a command argument, reporting an unknown id. */
function converterFor(target: string | Converter): Converter | undefined {
  if (typeof target !== 'string') {
    return target;
  }

  const converter = getConverter(target);

  if (!converter) {
    vscode.window.showErrorMessage(`Nestify: no converter registered for "${target}".`);
  }

  return converter;
}

/** The text a conversion reads, and where it sits. */
interface ConversionTarget {
  readonly editor: vscode.TextEditor;
  readonly range: vscode.Range;
  readonly hadSelection: boolean;
}

/** The selection, or the whole document when nothing is selected. */
function conversionTarget(): ConversionTarget | undefined {
  const editor = targetEditor();

  if (!editor) {
    vscode.window.showErrorMessage('Nestify: open a file first.');
    return undefined;
  }

  const document = editor.document;
  const hadSelection = !editor.selection.isEmpty;

  const range = hadSelection
    ? new vscode.Range(editor.selection.start, editor.selection.end)
    : new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));

  return { editor, range, hadSelection };
}

/**
 * Runs the converter, or reports why it could not and puts the cursor on the
 * character the parser stopped at, which beats hunting for it by hand.
 */
function convert(converter: Converter, target: ConversionTarget): string | undefined {
  try {
    return converter.run(target.editor.document.getText(target.range));
  } catch (error) {
    vscode.window.showErrorMessage(reportable(error));
    revealProblem(target, error);
    return undefined;
  }
}

function revealProblem(target: ConversionTarget, error: unknown): void {
  const offset = error instanceof ConversionError ? error.offset : undefined;

  if (offset === undefined) {
    return;
  }

  const { editor, range } = target;
  // The offset is into the converted text, which starts wherever the range does.
  const spot = editor.document.positionAt(editor.document.offsetAt(range.start) + offset);

  editor.selection = new vscode.Selection(spot, spot);
  editor.revealRange(new vscode.Range(spot, spot), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

/**
 * A message to show the user. Converters throw errors that already name
 * Nestify, so prefixing unconditionally read "Nestify: Nestify: …".
 */
function reportable(error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);

  return reason.startsWith('Nestify: ') ? reason : `Nestify: ${reason}`;
}

async function applyConverter(converter: Converter): Promise<void> {
  const target = conversionTarget();

  if (!target) {
    return;
  }

  const { editor, range, hadSelection } = target;
  const document = editor.document;
  const converted = convert(converter, target);

  if (converted === undefined) {
    return;
  }

  let applied: boolean;

  // The edit can fail as well as decline: the document may have been closed
  // between clicking a row in the sidebar and the edit reaching it. Left
  // unhandled that surfaces as a generic "command failed" instead of saying
  // what happened.
  try {
    applied = await editor.edit((editBuilder) => editBuilder.replace(range, converted));
  } catch (error) {
    vscode.window.showErrorMessage(reportable(error));
    return;
  }

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
