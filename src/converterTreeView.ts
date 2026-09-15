import * as vscode from 'vscode';
import { summariseActiveJson } from './activeJsonSummary';
import { Converter, listConverters } from './converters/registry';

/** The top row, describing the text a conversion would run on. */
interface SourceRow {
  readonly kind: 'source';
}

type Row = SourceRow | Converter;

function isSource(row: Row): row is SourceRow {
  return (row as SourceRow).kind === 'source';
}

/**
 * Backs the Nestify view in the Activity Bar: one row describing the JSON in
 * front of you, then one row per registered converter.
 *
 * Each converter row is a single line — title, then the change with both sides
 * of the arrow together. One line keeps the comparison horizontal; stacked
 * before/after rows made the eye travel to spot a small difference.
 */
export class ConverterTreeProvider implements vscode.TreeDataProvider<Row> {
  private readonly changed = new vscode.EventEmitter<void>();
  private pending: ReturnType<typeof setTimeout> | undefined;

  readonly onDidChangeTreeData = this.changed.event;

  /** Re-reads the registry and the active editor. */
  refresh(): void {
    this.changed.fire();
  }

  /**
   * Coalesces bursts of refreshes. Typing in the active file fires a change per
   * keystroke, and each refresh re-parses the document.
   */
  scheduleRefresh(delayMs = 300): void {
    if (this.pending) {
      clearTimeout(this.pending);
    }

    this.pending = setTimeout(() => {
      this.pending = undefined;
      this.refresh();
    }, delayMs);
  }

  getTreeItem(row: Row): vscode.TreeItem {
    return isSource(row) ? sourceItem() : converterItem(row);
  }

  getChildren(row?: Row): Row[] {
    // A flat list: neither row type has children.
    return row ? [] : [{ kind: 'source' }, ...listConverters()];
  }

  dispose(): void {
    if (this.pending) {
      clearTimeout(this.pending);
    }

    this.changed.dispose();
  }
}

function sourceItem(): vscode.TreeItem {
  const summary = summariseActiveJson();
  const item = new vscode.TreeItem(summary.label, vscode.TreeItemCollapsibleState.None);

  item.id = 'nestify.source';
  item.description = summary.detail;
  item.iconPath = new vscode.ThemeIcon(summary.icon);
  item.tooltip = new vscode.MarkdownString(
    summary.convertible
      ? 'The text a conversion will run on: the selection when there is one, otherwise the whole file.'
      : 'Nestify cannot convert this yet. Select valid JSON, or open a JSON file.'
  );

  return item;
}

function converterItem(converter: Converter): vscode.TreeItem {
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
