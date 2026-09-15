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

- **Toolbar** — on a `.json` or `.jsonc` file, two buttons sit top-right of the editor: flatten and nest.
- **Right-click** — **Nestify** → *Flatten JSON* / *Unflatten (Nest) JSON*.
- **Command Palette** — `Cmd+Shift+P` / `Ctrl+Shift+P`, then type `Nestify`.

The converted text stays selected so you can see what changed. Invalid JSON changes
nothing and tells you what is wrong.

No shortcuts are bundled, so nothing of yours is overridden. To add your own, bind
`nestify.flatten` or `nestify.unflatten` in **Keyboard Shortcuts**.

## Settings

| Setting             | Default | What it does                                        |
| ------------------- | ------- | --------------------------------------------------- |
| `nestify.separator` | `"."`   | Character that joins and splits key paths.          |
| `nestify.indent`    | `2`     | Spaces used to indent the JSON written back.        |

If your keys already contain dots, set `nestify.separator` to `"/"` or `"_"`.

## One thing to know about arrays

Flattening an array turns each index into a path segment, so `{ "tags": ["a"] }`
becomes `{ "tags.0": "a" }`. Nesting it back produces `{ "tags": { "0": "a" } }` — an
object, not an array. This is deliberate: it keeps gaps and out-of-order numeric keys
intact. If you round-trip arrays, expect objects on the way back.

Keys that clash, contain an empty segment, or use a reserved name such as `__proto__`
are refused, and the message names the key at fault.

## Contributing

Setup, architecture, and how to add a converter live in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
