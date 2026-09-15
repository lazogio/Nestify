import * as vscode from 'vscode';
import { Converter, listConverters } from './converters/registry';

/**
 * Backs the Nestify view in the Activity Bar with one row per registered
 * converter, so a converter added to the registry shows up without any UI work.
 *
 * Each row is a single line: title, then the shape of the change with both
 * sides of the arrow side by side. One line keeps the comparison horizontal —
 * stacked before/after rows made the eye travel to spot a small difference.
 */
export class ConverterTreeProvider implements vscode.TreeDataProvider<Converter> {
  private readonly changed = new vscode.EventEmitter<void>();

  readonly onDidChangeTreeData = this.changed.event;

  /** Re-reads the registry, for converters registered after activation. */
  refresh(): void {
    this.changed.fire();
  }

  getTreeItem(converter: Converter): vscode.TreeItem {
    // The short name leaves the row's width for the change itself.
    const item = new vscode.TreeItem(
      converter.shortTitle ?? converter.title,
      vscode.TreeItemCollapsibleState.None
    );

    item.id = converter.id;
    item.description = converter.hint;
    item.iconPath = new vscode.ThemeIcon(themeIconFor(converter.id));
    item.tooltip = tooltipFor(converter);
    // The whole row is the button, so no inline action competes with it.
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

/**
 * The row is deliberately terse, so the tooltip carries the roomier version for
 * anyone who wants it.
 */
function tooltipFor(converter: Converter): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString();

  tooltip.appendMarkdown(`**${converter.title}**\n\n`);
  tooltip.appendMarkdown('Click to run on the selection, or on the whole file when nothing is selected.');

  const example = examples[converter.id];

  if (example) {
    tooltip.appendMarkdown('\n\n');
    tooltip.appendCodeblock(example, 'jsonc');
  }

  return tooltip;
}

const examples: Record<string, string> = {
  flatten: '// before\n{ "app": { "name": "nestify" } }\n\n// after\n{ "app.name": "nestify" }',
  unflatten: '// before\n{ "app.name": "nestify" }\n\n// after\n{ "app": { "name": "nestify" } }'
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
