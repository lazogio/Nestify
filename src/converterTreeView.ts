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
    item.description = converter.id;
    item.iconPath = new vscode.ThemeIcon(themeIconFor(converter.id));
    item.tooltip = new vscode.MarkdownString(
      `Apply **${converter.title}** to the selection, or to the whole file when nothing is selected.`
    );
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
