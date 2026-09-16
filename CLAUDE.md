# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A VS Code extension (TypeScript, CommonJS, no bundler, no runtime dependencies) that
flattens nested JSON into separator-joined keys and nests it back. `tsc` compiles
`src/` to `out/`; `out/extension.js` is the published entry point.

## Commands

```bash
npm install
npm run compile                 # tsc -p ./
npm run watch                   # tsc -watch
npm test                        # compiles, then node --test over out/test/*.test.js

# one test file, or one test, after a compile
node --test out/test/jsonNesting.test.js
node --test --test-name-pattern="joins nested keys" out/test/jsonNesting.test.js

npx @vscode/vsce package        # nestify-<version>.vsix
```

There is no lint step; `tsc` is the only static check, and it runs with `strict`,
`noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` and
`noFallthroughCasesInSwitch`. CI (`.github/workflows/ci.yml`) runs exactly `npm ci &&
npm test` on Node 22. Press `F5` in VS Code for an Extension Development Host.

## Architecture

The layering exists so the conversion logic is testable without VS Code — keep it.

- `src/jsonNesting.ts` — pure `flattenJson` / `unflattenJson` / `depthOf` /
  `countFlatKeys` / `sortKeysDeep`. **No `vscode` import.** Everything under test
  lives here.
- `src/converters/jsonSource.ts` — `parseJsonSource()` and `ConversionError`, which
  carries the offset a bad parse stopped at. Also **no `vscode` import**, so the
  offset arithmetic (it compensates for leading whitespace trimmed before
  `JSON.parse`) is unit-testable.
- `src/converters/registry.ts` — the `Converter` interface (`id`, `title`,
  `shortTitle`, `hint`, `icon`, `example`, `skipReason`, `run`) and a module-level
  `Map`. Re-registering an id replaces it, so reloads stay idempotent.
- `src/converters/jsonFlattenConverters.ts` — registers `flatten` and `unflatten` as a
  module side effect.
- `src/extension.ts` — `activate()` wires commands to the registry and imports
  converter modules for their side effect. It knows no format details.
- `src/settings.ts` — `readSettings(resource)` is the **only** reader of `nestify.*`,
  and `writeSeparator()` its only writer. Always pass the document URI so a folder- or
  language-level override wins.
- `src/activeEditor.ts` — `conversionTarget()` returns the selection, or the whole
  document when nothing is selected. It also remembers the last active editor,
  because `window.activeTextEditor` is undefined while the sidebar view holds focus.
- `src/activeJsonSummary.ts` — the reading behind the view's header ("66 keys · 10
  levels deep"). Runs on every keystroke, so it is debounced, skips text over
  500k chars, and must never throw.
- `src/converterTreeView.ts` — one row per registered converter; state goes in
  `view.message`, not in rows.

### Adding a converter

Call `registerConverter({...})` in a new module under `src/converters/`, then import
that module for its side effect in `src/extension.ts`. Nothing else needs touching —
it appears in `Nestify: Convert With…`, the Activity Bar, and `Copy Converted…`
automatically. Only add a `package.json` command entry if it deserves its own palette
entry or toolbar button. Anything thrown from `run()` becomes an error notification,
so throw `Error`s worth reading; throw `ConversionError` with an offset to move the
cursor to the bad character. `CONTRIBUTING.md` has a worked example.

## Invariants worth preserving

- **Round-tripping is the contract.** Whatever flattens must nest back unchanged.
  `flattenJson` therefore *refuses up front* any key `unflattenJson` could not take
  back: one already containing the separator, an empty segment, `__proto__`, or two
  paths that join to the same flat key. Both directions must agree by construction.
  The pure functions keep that rule without exception; the `flatten` converter is
  what decides an already-flat document (`depthOf <= 1`, arrays aside) has no path
  to join and hands it straight back, which is the identity rather than a
  conversion the rule needs to protect.
- Prototype-safe writes: build results with `Object.fromEntries`, and use
  `Object.prototype.hasOwnProperty.call` for lookups — a plain `cursor[key]` finds
  inherited members, which used to break keys named `toString`/`valueOf`.
- `unflattenJson` only converts containers **it** created into arrays (tracked in the
  `built` set) and never mutates or merges into a value the input supplied.
- Recursion runs over user data: avoid `Math.max(...children.map(…))`-style spreads
  and other stack-per-element patterns.
- Empty objects and arrays are leaves, not levels, in both flattening and `depthOf`.
- Settings read through `readSettings()` only, so the header and the conversion can
  never disagree.

## Conventions

- Comments explain *why* a line is the way it is, often naming the bug that motivated
  it. Match that register; do not add restating-the-code comments.
- User-facing messages are full sentences that name the offending key and say what to
  do about it (e.g. "Set the separator to a character your keys do not contain.").
  Converter errors already start with `Nestify: `; `extension.ts` prefixes only when
  missing.
- Commit subjects are lowercase Conventional Commits (`fix:`, `feat:`, `docs:`, `ci:`).
- Behaviour changes need a `CHANGELOG.md` entry under the version being released —
  `.github/workflows/publish.yml` refuses to publish without a matching `## [x.y.z]`
  section.
- Tests are `node:test` + `node:assert/strict` over the pure modules, and are excluded
  from the `.vsix` by `.vscodeignore`.
