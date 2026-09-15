<h1 align="center">
  <img src="https://raw.githubusercontent.com/lazogio/Nestify/main/images/icon.png" width="112" alt="Nestify">
  <br>
  Nestify — JSON Flatten &amp; Nest
</h1>

<p align="center">
  Flatten nested JSON into dot-joined keys and nest it back again, right where you are editing.
</p>

```jsonc
// before                          // after "Nestify: Flatten JSON"
{                                  {
  "app": {                           "app.name": "nestify",
    "name": "nestify",               "app.window.width": 800
    "window": { "width": 800 }     }
  }
}
```

## Usage

Select the JSON you want to convert — or select nothing to convert the whole file —
then reach for whichever entry point suits you:

| Where | How |
| ----- | --- |
| **Editor toolbar** | On any `.json` / `.jsonc` file, two buttons sit in the top-right of the editor: `list-flat` to flatten, `list-tree` to nest. |
| **Right-click** | Editor context menu → **Nestify** → *Flatten JSON* / *Unflatten (Nest) JSON* / *Convert With…* |
| **Command Palette** | `Ctrl+Shift+P` / `Cmd+Shift+P` → `Nestify: Flatten JSON`, `Nestify: Unflatten (Nest) JSON`, or `Nestify: Convert With…` |

`Nestify: Convert With…` opens a quick pick listing **every registered converter**, so
converters added later are reachable without a new command.

After a conversion the result stays selected, so it is obvious what changed, and a
status bar message confirms what ran. If the text is not valid JSON nothing is
changed and an error message explains exactly why.

No keybindings are shipped, to avoid fighting with your existing ones — bind
`nestify.flatten` / `nestify.unflatten` in **Keyboard Shortcuts** if you use them often.

## Settings

| Setting             | Default | Description                                              |
| ------------------- | ------- | -------------------------------------------------------- |
| `nestify.separator` | `"."`   | Separator used to join and split nested key paths.        |
| `nestify.indent`    | `2`     | Spaces used to indent the JSON that Nestify writes back.  |

Set `nestify.separator` to `"/"`, `"_"`, or anything else if your key paths already
contain dots.

## How nesting works

- **Flatten** walks nested objects *and* arrays. Array items contribute their index
  as a path segment, so `{ "tags": ["a"] }` flattens to `{ "tags.0": "a" }`. Empty
  objects and arrays are kept as leaf values rather than being dropped.
- **Unflatten** treats every path segment as a plain object key, including numeric
  ones. `{ "tags.0": "a" }` nests back to `{ "tags": { "0": "a" } }` — arrays are
  never reconstructed. This keeps sparse and non-sequential numeric keys lossless,
  at the cost of a flatten → unflatten round trip turning arrays into objects.
- Keys that collide, contain an empty segment, or use a reserved segment such as
  `__proto__` are rejected with a message naming the offending key.

## Project layout

```
images/icon.svg                    icon source; icon.png is the rasterised 128×128
src/
  extension.ts                     activate(): wires the commands to the registry
  jsonNesting.ts                   pure flattenJson() / unflattenJson(), no vscode import
  converters/
    registry.ts                    Converter registry (id, title, run)
    jsonFlattenConverters.ts       registers "flatten" and "unflatten"
```

## Adding a new converter

Converters self-register, so a new format (JSON ↔ YAML, JSON ↔ .env, …) never has to
touch the command logic in `extension.ts`:

```ts
// src/converters/yamlConverters.ts
import { registerConverter } from './registry';

registerConverter({
  id: 'json-to-yaml',
  title: 'JSON to YAML',
  run(sourceText: string): string {
    return toYaml(JSON.parse(sourceText)); // throw an Error to surface a message
  }
});
```

Import the module for its side effect in `src/extension.ts` and it immediately shows
up in `Nestify: Convert With…`. Give it a dedicated command in `package.json` only if
it deserves its own palette entry or toolbar button. Anything thrown from `run()` is
shown as an error notification, so throw `Error`s with messages worth reading.

## Development

```bash
npm install
npm run compile     # or: npm run watch
```

Press `F5` in VS Code to launch an Extension Development Host with Nestify loaded.

## Publishing

Packaging and publishing use [`vsce`](https://github.com/microsoft/vscode-vsce):

```bash
npm install -g @vscode/vsce
vsce package                       # produces nestify-<version>.vsix
vsce publish --pat <token>         # publishes to the VS Code Marketplace
```

Before the first publish, set `publisher` in `package.json` to your real Marketplace
publisher id (it is currently the placeholder `your-publisher-name`) and create a
publisher at <https://marketplace.visualstudio.com/manage>.

`.github/workflows/publish.yml` publishes automatically when you push a `v*` tag. It
needs a `VSCE_PAT` repository secret (an Azure DevOps Personal Access Token with the
Marketplace → Manage scope), and optionally an `OVSX_PAT` secret to mirror the release
to [Open VSX](https://open-vsx.org).

```bash
npm version patch && git push --follow-tags
```

## License

[MIT](LICENSE)
