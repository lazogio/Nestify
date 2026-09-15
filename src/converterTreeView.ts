import * as vscode from 'vscode';
import { ActiveJsonSummary, summariseActiveJson } from './activeJsonSummary';
import { Converter, listConverters } from './converters/registry';

/**
 * Backs the Nestify view in the Activity Bar with one row per registered
 * converter, and keeps the view's header describing the JSON in front of you.
 *
 * The list holds actions only: what the file currently looks like is state, so
 * it belongs in the header rather than in a row that merely looks clickable.
 * Each row shows the change with both sides of the arrow together — one line
 * keeps the comparison horizontal instead of making the eye travel.
 */
export class ConverterTreeProvider implements vscode.TreeDataProvider<Converter> {
  private readonly changed = new vscode.EventEmitter<void>();
  private pending: ReturnType<typeof setTimeout> | undefined;
  private summary: ActiveJsonSummary = summariseActiveJson();

  readonly onDidChangeTreeData = this.changed.event;

  /** Re-reads the registry and the active editor. */
  refresh(): void {
    this.summary = summariseActiveJson();
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

  /** The last reading, for the code that keeps the view's header in step. */
  currentSummary(): ActiveJsonSummary {
    return this.summary;
  }

  getTreeItem(converter: Converter): vscode.TreeItem {
    // The short name leaves the row's width for the change itself.
    const item = new vscode.TreeItem(
      converter.shortTitle ?? converter.title,
      vscode.TreeItemCollapsibleState.None
    );

    const blocked = reasonToSkip(converter.id, this.summary);

    item.id = converter.id;
    item.description = blocked ?? converter.hint;
    item.iconPath = new vscode.ThemeIcon(themeIconFor(converter.id));
    item.tooltip = tooltipFor(converter, blocked);
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
    if (this.pending) {
      clearTimeout(this.pending);
    }

    this.changed.dispose();
  }
}

/**
 * Why running this converter now would not help, or `undefined` when it would.
 * Saying so on the row is cheaper for the user than clicking and reading an
 * error notification.
 */
function reasonToSkip(converterId: string, summary: ActiveJsonSummary): string | undefined {
  if (!summary.shape) {
    return undefined;
  }

  if (converterId === 'flatten' && summary.shape === 'flat') {
    return 'already flat';
  }

  if (converterId === 'unflatten' && summary.shape === 'nested') {
    return 'needs flat keys';
  }

  return undefined;
}

/**
 * The row is deliberately terse, so the tooltip carries the roomier version for
 * anyone who wants it.
 */
function tooltipFor(converter: Converter, blocked: string | undefined): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString();

  tooltip.appendMarkdown(`**${converter.title}**\n\n`);

  if (blocked) {
    tooltip.appendMarkdown(`${explanations[converter.id] ?? blocked}\n\n`);
  }

  tooltip.appendMarkdown('Click to run on the selection, or on the whole file when nothing is selected.');

  const example = examples[converter.id];

  if (example) {
    tooltip.appendMarkdown('\n\n');
    tooltip.appendCodeblock(example, 'jsonc');
  }

  return tooltip;
}

const explanations: Record<string, string> = {
  flatten: 'This JSON has no nesting left to flatten.',
  unflatten: 'This JSON is nested already — nesting expects keys joined by the separator.'
};

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
