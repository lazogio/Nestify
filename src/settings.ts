import * as vscode from 'vscode';

/** Everything the converters and the view read from the user's settings. */
export interface NestifySettings {
  readonly separator: string;
  readonly indent: number;
  readonly arrays: 'rebuild' | 'objects';
  readonly sortKeys: boolean;
}

/**
 * Reads the settings as they apply to `resource`.
 *
 * Passing the document matters: a folder in a multi-root workspace, or a
 * language, can override `nestify.separator`, and a conversion that read the
 * window's value would flatten with a character the file's own settings said
 * not to use. One reader, so the view and the conversion cannot disagree.
 */
export function readSettings(resource?: vscode.Uri): NestifySettings {
  const config = vscode.workspace.getConfiguration('nestify', resource);
  const separator = config.get<string>('separator', '.');
  const indent = config.get<number>('indent', 2);

  return {
    separator: typeof separator === 'string' && separator.length > 0 ? separator : '.',
    indent: Number.isFinite(indent) && indent >= 0 ? Math.floor(indent) : 2,
    arrays: config.get<string>('arrays', 'rebuild') === 'objects' ? 'objects' : 'rebuild',
    sortKeys: config.get<boolean>('sortKeys', false) === true
  };
}

/**
 * Records the separator the user accepted from a refused conversion.
 *
 * Written rather than applied to the one conversion: flattening with a
 * separator that nesting would not read back is exactly the mismatch the
 * refusal exists to prevent, so both directions have to move together.
 */
export async function writeSeparator(
  resource: vscode.Uri | undefined,
  separator: string
): Promise<void> {
  const config = vscode.workspace.getConfiguration('nestify', resource);
  // The keys that needed it belong to this project, so the choice is stored
  // with it. With no folder open there is nowhere to put it but the user's own
  // settings.
  const target = vscode.workspace.workspaceFolders?.length
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;

  await config.update('separator', separator, target);
}
