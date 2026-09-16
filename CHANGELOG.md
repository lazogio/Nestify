# Changelog

All notable changes to Nestify are documented in this file.

## [0.0.4] - Unreleased

### Fixed

- Flattening no longer drops a key when two paths join to the same flat key.
  `{ "a.b": 1, "a": { "b": 2 } }` used to keep only the second value; it now
  names both clashing paths and changes nothing. A key called `__proto__` is
  likewise carried through as data instead of disappearing.
- The Activity Bar view states the clash above the list rather than reporting a
  key count the conversion would refuse, and no longer throws while you type
  over a file with a very large array — it says it cannot measure instead.
- Nesting a key named after a built-in, such as `toString` or `valueOf`, no
  longer fails with a conflict that was not there.

### Added

- Unit tests for `flattenJson` / `unflattenJson`, run with `npm test`.

## [0.0.3] - 2026-09-15

### Added

- Nestify icon in the Activity Bar, opening a **Converters** view that lists every
  registered converter — click one to apply it. Converters added to the registry
  appear here without any extra wiring.
- Flatten and nest buttons in the view's header.
- Each row shows the change on one line — `{a:{b}} → {a.b}` — with the roomier
  before/after in the tooltip.
- The view states what a conversion would act on above the list — `66 keys · 10
  levels deep`, or `Selection: …` when text is selected.
- A converter that would not help says so instead of showing its example:
  `already flat`, or `needs flat keys`. Anything blocking a conversion — invalid
  JSON, no file open — is stated above the list.

### Fixed

- Running a converter from the Activity Bar no longer reports "open a file first"
  when the view has focus.
- An empty object or array no longer counts as a level of nesting, so a flat file
  with an `[]` in it reads as flat.
- Optional `hint` on a converter: a few words describing the transform, shown beside
  the title in the view and in `Nestify: Convert With…`.

## [0.0.2] - 2026-09-15

### Changed

- Clearer Marketplace description, naming the three ways to run a conversion.
- Rewrote the README around using the extension; moved setup, architecture, and
  release steps into `CONTRIBUTING.md`.

## [0.0.1] - 2026-09-15

### Added

- `Nestify: Flatten JSON` — flatten nested JSON into dot-joined keys.
- `Nestify: Unflatten (Nest) JSON` — rebuild nested JSON from dot-joined keys.
- `Nestify: Convert With…` — pick a converter from a quick-pick list.
- Editor context submenu and title-bar actions for JSON and JSONC files.
- Settings: `nestify.separator` and `nestify.indent`.
