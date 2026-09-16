<h1 align="center">
  <img src="https://raw.githubusercontent.com/lazogio/Nestify/main/images/icon.png" width="112" alt="Nestify">
  <br>
  Nestify — JSON Flatten &amp; Nest
</h1>

<p align="center">
  Turn nested JSON into flat dot-joined keys, and turn it back, without leaving the editor.
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

Handy for i18n message files, `.env`-style config, flat key/value stores, and any
diff that is easier to read one line per key.

## How to use it

Select the JSON you want to convert, or select nothing to convert the whole file.
Then pick whichever is closest to hand:

- **Toolbar** — on a `.json` file, two buttons sit top-right of the editor: flatten and nest.
- **Right-click** — **Nestify** → *Flatten JSON* / *Unflatten (Nest) JSON*.
- **Command Palette** — `Cmd+Shift+P` / `Ctrl+Shift+P`, then type `Nestify`.
- **Sidebar** — the Nestify icon in the Activity Bar lists every converter; click one to run it.
  It states what would be converted — key count and nesting depth of the file or your
  selection — and a converter that would not help right now says why instead of offering itself.
  Hovering a row reveals a copy button, which puts the result on the clipboard and leaves
  the file alone. `Nestify: Copy Converted…` does the same from the Command Palette.

Converting a selection leaves it selected, so you can see what changed; converting a
whole file puts the cursor at the top of it. Invalid JSON changes nothing, tells you
what is wrong, and puts the cursor on the character the parser stopped at.

JSON with comments is not supported: the conversion is written back with
`JSON.stringify`, which would drop every comment in the file.

No shortcuts are bundled, so nothing of yours is overridden. To add your own, bind
`nestify.flatten` or `nestify.unflatten` in **Keyboard Shortcuts**.

## Settings

| Setting             | Default     | What it does                                              |
| ------------------- | ----------- | --------------------------------------------------------- |
| `nestify.separator` | `"."`       | Character that joins and splits key paths.                |
| `nestify.indent`    | `2`         | Spaces used to indent the JSON written back.              |
| `nestify.arrays`    | `"rebuild"` | Whether nesting rebuilds arrays from index keys.          |
| `nestify.sortKeys`  | `false`     | Write each object's keys in order.                        |

If your keys already contain dots, set `nestify.separator` to `"/"` or `"_"`.

## One thing to know about arrays

Flattening an array turns each index into a path segment, so `{ "tags": ["a"] }`
becomes `{ "tags.0": "a" }`, and nesting turns it back into the array it came from.
Keys that are not exactly the indices `0…n-1` — a gap, or `"01"` — stay an object,
since no array could hold them without inventing values.

The one shape this cannot tell apart is an object whose keys already are `"0"`, `"1"`,
… : it flattens the same way an array does, so it comes back as an array — including
the file itself, which turns from an object into a JSON array when its own top-level
keys are indices. Set `nestify.arrays` to `"objects"` if that is your data, and every
container stays an object on the way back.

A key that already contains the separator is refused, because once joined it cannot
be told from a path: flattening `{ "app": { "v1.2": { "x": 1 } } }` would produce
`app.v1.2.x`, which nests back four levels deep instead of the three that were
written. Set `nestify.separator` to a character your keys do not contain and the same
file converts cleanly. Keys that clash, contain an empty segment, or use the reserved
name `__proto__` are refused too, in both directions, and the message names the key at
fault. Whatever flattens can be nested back.

## Contributing

Setup, architecture, and how to add a converter live in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
