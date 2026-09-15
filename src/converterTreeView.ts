import * as vscode from 'vscode';
import { Converter, listConverters } from './converters/registry';

/** A before/after line shown under its converter when the row is expanded. */
interface ExampleRow {
  readonly kind: 'example';
  readonly label: 'before' | 'after';
  readonly json: string;
}

type Row = Converter | ExampleRow;

function isExample(row: Row): row is ExampleRow {
  return (row as ExampleRow).kind === 'example';
}

/**
 * Backs the Nestify view in the Activity Bar with one row per registered
 * converter, so a converter added to the registry shows up without any UI work.
 * Expanding a row shows what the conversion does to a small sample.
 */
export class ConverterTreeProvider implements vscode.TreeDataProvider<Row> {
  private readonly changed = new vscode.EventEmitter<void>();

  readonly onDidChangeTreeData = this.changed.event;

  /** Re-reads the registry, for converters registered after activation. */
  refresh(): void {
    this.changed.fire();
  }

  getTreeItem(row: Row): vscode.TreeItem {
    return isExample(row) ? exampleItem(row) : converterItem(row);
  }

  getChildren(row?: Row): Row[] {
    if (!row) {
      return listConverters();
    }

    return isExample(row) ? [] : examplesFor(row.id);
  }

  dispose(): void {
    this.changed.dispose();
  }
}

function converterItem(converter: Converter): vscode.TreeItem {
  const hasExample = examplesFor(converter.id).length > 0;

  const item = new vscode.TreeItem(
    converter.title,
    hasExample ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
  );

  item.id = converter.id;
  // The hint reads as a transform, which is more use than repeating the id.
  item.description = converter.hint;
  item.iconPath = new vscode.ThemeIcon(themeIconFor(converter.id));
  item.tooltip = new vscode.MarkdownString(
    `Run **${converter.title}** on the selection, or on the whole file when nothing is selected.`
  );
  // Drives the inline run button contributed in package.json.
  item.contextValue = 'nestifyConverter';
  item.command = {
    command: 'nestify.runConverter',
    title: converter.title,
    arguments: [converter.id]
  };

  return item;
}

function exampleItem(example: ExampleRow): vscode.TreeItem {
  const item = new vscode.TreeItem(example.json, vscode.TreeItemCollapsibleState.None);

  // The JSON is the label so it reads first; the side note says which side it is.
  item.description = example.label;
  item.tooltip = new vscode.MarkdownString(`\`\`\`json\n${example.json}\n\`\`\``);

  return item;
}

/** Kept short on purpose: the view is narrow and long samples just truncate. */
function examplesFor(converterId: string): ExampleRow[] {
  const nested = '{ "app": { "name": "nestify" } }';
  const flat = '{ "app.name": "nestify" }';

  switch (converterId) {
    case 'flatten':
      return [
        { kind: 'example', label: 'before', json: nested },
        { kind: 'example', label: 'after', json: flat }
      ];
    case 'unflatten':
      return [
        { kind: 'example', label: 'before', json: flat },
        { kind: 'example', label: 'after', json: nested }
      ];
    default:
      return [];
  }
}

/** Matches the icons already used by the toolbar buttons, falling back to a generic one. */
function themeIconFor(converterId: string): string {
  switch (converterId) {
    case 'flatten':
      return 'list-flat';
    case 'unflatten':
      return 'list-tree';
    default:
      return 'json';
  }
}
