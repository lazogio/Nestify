# Changelog

All notable changes to Nestify are documented in this file.

## [0.0.3] - 2026-09-15

### Added

- Nestify icon in the Activity Bar, opening a **Converters** view that lists every
  registered converter — click one to apply it. Converters added to the registry
  appear here without any extra wiring.
- Flatten and nest buttons in the view's header, and a hover tooltip showing the
  before/after shape of each conversion.
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
