# Contributing to Nestify

## Development

```bash
npm install
npm run compile     # or: npm run watch
npm test            # compiles, then runs the unit tests
```

Press `F5` in VS Code to launch an Extension Development Host with Nestify loaded.

## Project layout

```
images/icon.svg                    icon source; icon.png is the rasterised 128×128
src/
  extension.ts                     activate(): wires the commands to the registry
  jsonNesting.ts                   pure flattenJson() / unflattenJson() / depthOf(), no vscode import
  converters/
    registry.ts                    Converter registry (id, title, run)
    jsonFlattenConverters.ts       registers "flatten" and "unflatten"
  test/
    jsonNesting.test.ts            node:test suite over the pure helpers
```

`jsonNesting.ts` imports nothing from `vscode`, so the conversion logic stays testable
on its own. `npm test` compiles the project and runs `node --test` over `out/test`;
tests are kept out of the published `.vsix` by `.vscodeignore`. The same command runs
in CI (`.github/workflows/ci.yml`) on every push to `main` and every pull request.

## Adding a converter

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

Import the module for its side effect in `src/extension.ts` and it shows up in
`Nestify: Convert With…` straight away. Add a dedicated command in `package.json` only
if it deserves its own palette entry or toolbar button. Anything thrown from `run()`
becomes an error notification, so throw `Error`s with messages worth reading.

## Releasing

Releases run through `.github/workflows/publish.yml`. Add the new version's section to
`CHANGELOG.md` first — the workflow refuses to publish without it — then start a
release from **Actions → Publish Extension → Run workflow** and choose `patch`,
`minor`, or `major`. The workflow raises the version, commits, tags, publishes to the
Marketplace, and pushes the tag back.

Pushing a `v*` tag by hand publishes the version currently in `package.json`:

```bash
npm version patch && git push --follow-tags
```

Publishing needs a `VSCE_PAT` repository secret — an Azure DevOps Personal Access
Token scoped to **Marketplace → Manage**, created with **All accessible
organizations**. An optional `OVSX_PAT` secret mirrors the release to
[Open VSX](https://open-vsx.org); without it that step is skipped without failing the
run.

To build or publish from your machine instead:

```bash
npx @vscode/vsce package            # produces nestify-<version>.vsix
npx @vscode/vsce publish            # after: npx @vscode/vsce login <publisher>
```
