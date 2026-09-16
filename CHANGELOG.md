# Changelog

All notable changes to Nestify are documented in this file.

## [0.0.6] - 2026-09-16

### Added

- Nesting refused over a key conflict now names the separator the keys are
  actually joined with and offers to set it, the way flattening already did.
  A .NET `appsettings.json` — paths joined with `:`, last segment a namespace
  full of dots — refused under `.` with nothing to act on; it now offers `:`,
  under which it nests cleanly. The offer is made only after nesting the whole
  document with the candidate, and only for a separator the keys contain, since
  one they do not contain would nest nothing.

## [0.0.5] - 2026-09-16

### Added

- A flatten refused because a key already contains the separator now names one
  the document leaves free and offers to set it, so the conversion the refusal
  blocked is a click away. Both directions move together: the separator is
  written to your settings rather than applied to the one conversion, since
  flattening with a separator nesting would not read back is the mismatch the
  refusal exists to prevent.

## [0.0.4] - 2026-09-16

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

- Flattening now refuses any key that nesting could not take back — one that
  already contains the separator, an empty segment, or `__proto__` — instead of
  quietly reshaping the document. `{ "a.b": 1, "a": { "c": 2 } }` used to flatten
  to `{ "a.b": 1, "a.c": 2 }` and nest back as `{ "a": { "b": 1, "c": 2 } }`.
- Nesting no longer writes into a value the flat document supplied, which merged
  keys into data that was not Nestify's to reshape and mutated the object it was
  given. `{ "a": { "b": 1 }, "a.c": 2 }` is reported as the conflict it is.
- A failed conversion no longer clears the selection while pointing at the bad
  character, which made the next run convert the whole file instead of the
  fragment that was selected.
- `Copy Converted…` works from the editor's context menu, which forwards the
  file's URI where the command expected a converter.
- `constructor` and `prototype` are ordinary keys again. They were refused along
  with `__proto__`, but on a plain object they cannot reach the prototype, so
  refusing them only blocked valid documents such as `{ "constructor": { … } }`.
- Error notifications no longer read `Nestify: Nestify: …`.
- An edit the editor rejects outright now says so, instead of surfacing as a
  generic command failure.
- The nest row in the Activity Bar asks whether any key is a joined path rather
  than how deep the file is, so `{ "a.b": 1, "c": { "d": 2 } }` is no longer
  marked unusable when nesting it works.

- Settings are read for the file being converted, so a folder-level or
  language-level `nestify.separator` is honoured instead of the window's value —
  and the sidebar and the conversion now read it through the same code, so they
  cannot disagree.

### Changed

- The toolbar buttons no longer appear on JSON-with-comments files. The result
  is written back with `JSON.stringify`, which would drop every comment, so the
  buttons offered something that could not work.
- Removed the Activity Bar welcome text, which could never render: the view
  always lists the registered converters.

### Added

- Nesting rebuilds arrays: `{ "tags.0": "a" }` comes back as `{ "tags": ["a"] }`,
  where the keys are exactly the indices `0…n-1`. Gaps and keys such as `"01"`
  stay objects. `nestify.arrays: "objects"` keeps the previous behaviour, which
  is what a document of index-like keys wants.
- `nestify.sortKeys` writes each object's keys in order, for a diff that does not
  depend on where a key was written. Arrays keep their order.
- `Nestify: Copy Converted…` puts the result on the clipboard and leaves the file
  alone. The Activity Bar rows carry it as a hover action.
- Invalid JSON now puts the cursor on the character the parser stopped at.
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
