<h1 align="center">
  <img src="https://raw.githubusercontent.com/lazogio/Nestify/main/images/icon.png" width="112" alt="Nestify">
  <br>
  Nestify — JSON Flatten &amp; Nest
</h1>

<p align="center">
  Flatten nested JSON into dot-joined keys and nest it back — and move it in and out of
  an escaped string or a <code>.env</code> — without leaving the editor.
</p>

<p align="center">
  <a href="https://github.com/lazogio/Nestify/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
</p>

<p align="center">
  <a href="https://github.com/lazogio/Nestify/blob/main/images/demo.mp4">
    <img src="https://raw.githubusercontent.com/lazogio/Nestify/main/images/demo.gif" width="420" alt="Nestify demo: flattening nested JSON into dot-path keys in VS Code">
  </a>
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
- **Command Palette** — `Cmd+Shift+P` / `Ctrl+Shift+P`, then type `Nestify`. Every converter
  has its own entry, and `Nestify: Convert With…` lists them all to pick from.
- **Sidebar** — the Nestify icon in the Activity Bar lists every converter; click one to run it.
  It states what would be converted — key count and nesting depth of the file or your
  selection, or `JSON string` or `.env · 4 keys` when it is one of those — and a converter
  that would not help right now says why instead of offering itself.
  Hovering a row reveals a copy button, which puts the result on the clipboard and leaves
  the file alone. `Nestify: Copy Converted…` does the same from the Command Palette.

Converting a selection leaves it selected, so you can see what changed; converting a
whole file puts the cursor at the top of it. Invalid JSON changes nothing, tells you
what is wrong, and puts the cursor on the character the parser stopped at.

JSON with comments is not supported: the conversion is written back with
`JSON.stringify`, which would drop every comment in the file.

No shortcuts are bundled, so nothing of yours is overridden. To add your own, bind
`nestify.flatten`, `nestify.unflatten`, `nestify.parseString`, `nestify.stringify`,
`nestify.jsonToEnv`, or `nestify.envToJson` in **Keyboard Shortcuts**.

## JSON that arrived as a string

JSON often travels escaped inside a single value — a log line, a database column,
a webhook field. **Nestify: Parse JSON String** takes that layer off:

```jsonc
// before                                  // after "Nestify: Parse JSON String"
"{\"app\":{\"name\":\"nestify\"}}"         {
                                             "app": { "name": "nestify" }
                                           }
```

**Nestify: Stringify JSON** goes back the other way, so whatever stringifies parses
back. The literal it writes stays on one line whatever `nestify.indent` says, since
it exists to sit inside another document, where an indented body would come back as
a run of `\n` to read around.

If the surrounding quotes were lost on the way out of a log viewer, paste the
fragment as it is — `{\"app\":{\"name\":\"nestify\"}}` is taken too. Text still
carrying an escaped quote can only have been a string; without that tell, nothing
is assumed and the text is left alone.

Only an object or an array is unwrapped. A string around a bare value is data that
happens to parse rather than a document that arrived escaped, and unwrapping it
would change it: the id `"1234567890123456789"` comes back as
`1234567890123456800`, and `"1e5"` as `100000`. Those keep their quotes, and the
refusal says so.

## Config as a `.env`

A `.env` file is one flat key per line, which is the shape flattening already
produces. **Nestify: JSON to .env** and **Nestify: .env to JSON** move between the
two, and they are true inverses — what goes out comes back as it was, arrays
included:

```ini
# after "Nestify: JSON to .env"
app__name="nestify"
app__port=8080
app__tags__0="a"
api_key="sk-1"
zip="02134"
```

Paths are joined with `__` rather than `_`, which `nestify.envSeparator` changes. A
single underscore would refuse most real configs, since a key like `api_key` already
contains it and could no longer be told from a path; `__` leaves those alone, and is
what ASP.NET Core reads nested config from the environment with.

Values are written as JSON, because `.env` has no types of its own: unquoted, `02134`
reads back as `2134`, so `zip="02134"` is what keeps it the string it was. Reading
goes the same way round — a value is only taken as JSON when writing it again gives
back the very text that was read, so the `.env` you already have survives being
imported. `ID=1234567890123456789` stays that exact id instead of becoming
`...800`, and `X=1e5` stays `1e5` rather than `100000`.

Reading also takes what real files contain: blank lines, whole-line and inline `#`
comments, an `export` prefix, single-quoted values, and a value holding its own `=`,
like a connection string. A `#` inside quotes stays part of the value. A key set
twice is refused rather than one of its values being quietly dropped, and a refusal
puts the cursor on the line it is about.

A string a shell would rewrite goes out in single quotes rather than JSON ones,
since double quotes are the one form `source` and docker-compose expand —
`pass="a$USER"` would otherwise reach them as `aroot`. Keys are written exactly as
the document spells them: not upper-cased, since `appName` could not be recovered
from `APPNAME`, and never containing whitespace, which no environment variable name
can.

## Settings

| Setting             | Default     | What it does                                              |
| ------------------- | ----------- | --------------------------------------------------------- |
| `nestify.separator` | `"."`       | Character that joins and splits key paths.                |
| `nestify.indent`    | `2`         | Spaces used to indent the JSON written back.              |
| `nestify.arrays`    | `"rebuild"` | Whether nesting rebuilds arrays from index keys.          |
| `nestify.sortKeys`  | `false`     | Write each object's keys in order.                        |
| `nestify.envSeparator` | `"__"`   | Separator that joins key paths in a `.env`.               |

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
written. The refusal names a separator the file leaves free and offers to set it for
you, so one click converts the same file cleanly; `nestify.separator` takes whatever
character you prefer if you would rather choose it yourself. Keys that clash, contain
an empty segment, or use the reserved name `__proto__` are refused too, in both
directions, and the message names the key at fault. Whatever flattens can be nested
back.

A separator of more than one character — `::`, or the `__` a `.env` uses — is refused
on a second count, because a key can run into it without containing it. Under `__`,
`{ "user_": { "name": 1 } }` joins to `user___name`, which would split back as `user`
→ `_name`: a different document. Flattening checks that every key it writes splits
back into the path that joined to it, so the two directions agree by construction.

Nesting makes the same offer from the other side. A file whose keys are joined with
something other than your separator — a .NET `appsettings.json`, whose paths use `:`
and whose last segment is a dotted namespace like
`Serilog:MinimumLevel:Override:Microsoft.Extensions.Diagnostics` — is refused under
`.`, since the namespace splits and collides with the key beside it. The message
offers the `:` those keys are actually written with, under which the file nests
cleanly. It works the other way round just as well: with `nestify.separator` set to
`:` for those config files, a dot-joined file has no key to split, so rather than
handing it back unchanged Nestify offers the `.` it is written with. A file that is
already nested has nothing to do under any separator, and converts quietly.

## Contributing

Setup, architecture, and how to add a converter live in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
