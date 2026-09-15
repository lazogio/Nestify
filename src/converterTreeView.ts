import * as vscode from 'vscode';
import { Converter, listConverters } from './converters/registry';

/**
 * Backs the Nestify view in the Activity Bar with one row per registered
 * converter, so a converter added to the registry shows up without any UI work.
 */
export class ConverterTreeProvider implements vscode.TreeDataProvider<Converter> {
  private readonly changed = new vscode.EventEmitter<void>();

  readonly onDidChangeTreeData = this.changed.event;

  /** Re-reads the registry, for converters registered after activation. */
  refresh(): void {
    this.changed.fire();
  }

  getTreeItem(converter: Converter): vscode.TreeItem {
    const item = new vscode.TreeItem(converter.title, vscode.TreeItemCollapsibleState.None);

    item.id = converter.id;
    // The hint reads as a transform, which is more use than repeating the id.
    item.description = converter.hint;
    item.iconPath = new vscode.ThemeIcon(themeIconFor(converter.id));
    item.tooltip = tooltipFor(converter);
    item.command = {
      command: 'nestify.runConverter',
      title: converter.title,
      arguments: [converter.id]
    };

    return item;
  }

  getChildren(element?: Converter): Converter[] {
    // A flat list: converters have no children.
    return element ? [] : listConverters();
  }

  dispose(): void {
    this.changed.dispose();
  }
}

function tooltipFor(converter: Converter): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString();

  tooltip.appendMarkdown(`**${converter.title}**\n\n`);
  tooltip.appendMarkdown('Runs on the selection, or on the whole file when nothing is selected.');

  const example = examples[converter.id];

  if (example) {
    tooltip.appendMarkdown('\n\n');
    tooltip.appendCodeblock(example, 'jsonc');
  }

  return tooltip;
}

/** Shown in the row tooltip, so the shape of the change is visible before running it. */
const examples: Record<string, string> = {
  flatten: '{ "app": { "name": "nestify" } }\n\n{ "app.name": "nestify" }',
  unflatten: '{ "app.name": "nestify" }\n\n{ "app": { "name": "nestify" } }'
};

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
