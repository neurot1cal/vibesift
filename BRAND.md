# vibesift brand

> Terminal-native, monospace-first, two-theme. Drawn with box-drawing
> characters whenever the surface allows.

## Tagline

**Scope. Sift. Ship.**

Three single-syllable verbs from the project name — `sift` is the centerpiece.
Always title case in product copy, always lowercase in code/CLI.

## Logo mark

Both forms are pure text — no image asset required. Render in the canonical
monospace stack: `JetBrains Mono` → `SFMono-Regular` → `ui-monospace` → `monospace`.

```
┌─ vibesift ─┐
│  scope     │
│  sift      │
│  ship      │
└────────────┘
```

Tight form (favicon, social):

```
[ vbs ]
```

ASCII-art hero used in the README and asciinema title cards:

```
  ██╗   ██╗██╗██████╗ ███████╗███████╗██╗███████╗████████╗
  ██║   ██║██║██╔══██╗██╔════╝██╔════╝██║██╔════╝╚══██╔══╝
  ██║   ██║██║██████╔╝█████╗  ███████╗██║█████╗     ██║
  ╚██╗ ██╔╝██║██╔══██╗██╔══╝  ╚════██║██║██╔══╝     ██║
   ╚████╔╝ ██║██████╔╝███████╗███████║██║██║        ██║
    ╚═══╝  ╚═╝╚═════╝ ╚══════╝╚══════╝╚═╝╚═╝        ╚═╝

   Scope.  Sift.  Ship.
```

## Color palette

Two themes share the same accent + semantic colors. Neutrals invert.

### Dark (default)

| Token            | Hex       | Use                                    |
| ---------------- | --------- | -------------------------------------- |
| `--bg`           | `#09090b` | page background                        |
| `--surface`      | `#0f0f12` | header chips, theme toggle background  |
| `--surface-2`    | `#18181b` | code blocks, secondary surface         |
| `--border`       | `#27272a` | hairlines, borders                     |
| `--border-strong`| `#3f3f46` | buttons, diff link border              |
| `--text`         | `#fafafa` | body, headings, primary                |
| `--text-muted`   | `#d4d4d8` | paragraphs, list items                 |
| `--text-dim`     | `#a1a1aa` | meta, links in chrome                  |
| `--text-faint`   | `#71717a` | done states, log labels                |
| `--text-ghost`   | `#52525b` | timestamps, ghost text                 |

### Light

Neutrals invert; everything else holds.

| Token            | Hex       |
| ---------------- | --------- |
| `--bg`           | `#fafafa` |
| `--surface`      | `#ffffff` |
| `--surface-2`    | `#f4f4f5` |
| `--border`       | `#e4e4e7` |
| `--border-strong`| `#d4d4d8` |
| `--text`         | `#09090b` |
| `--text-muted`   | `#27272a` |
| `--text-dim`     | `#52525b` |
| `--text-faint`   | `#71717a` |
| `--text-ghost`   | `#a1a1aa` |

### Accents (theme-stable)

| Token         | Hex       | Role                                                           |
| ------------- | --------- | -------------------------------------------------------------- |
| `--accent`    | `#facc15` | yellow-400. Decision marker, pinned-sentence highlight, hero accent. |
| `--accent-deep` | `#ca8a04` | yellow-600. Outlines, focused borders, warning text. |
| `--positive` | `#22c55e` | green-500. Done, shipped, success.                              |
| `--warning`  | `#ca8a04` | yellow-600. Pending, awaiting decision.                         |

### Semantic badges

| Theme | Active background | Active foreground | Shipped background | Shipped foreground |
|-------|-------------------|-------------------|--------------------|--------------------|
| Dark  | `#1e3a8a`         | `#bfdbfe`         | `#14532d`          | `#bbf7d0`          |
| Light | `#dbeafe`         | `#1e3a8a`         | `#dcfce7`          | `#166534`          |

## Typography

- **Body / UI:** `ui-sans-serif`, `system-ui`, `-apple-system`, `"Segoe UI"`,
  `sans-serif`. No web fonts. The page ships zero network requests.
- **Code / monospace:** `ui-monospace`, `SFMono-Regular`, `"JetBrains Mono"`,
  `monospace`. Used for the `brand-mark`, code spans, and the theme toggle.
- **Sizes:**
  - h1 — `1.5rem` (24px)
  - h2 — `1.125rem` (18px)
  - h3 — `0.875rem` uppercase + 0.05em letter-spacing
  - body — `1rem` / line-height 1.55
  - meta — `0.75rem` to `0.875rem`

## Iconography

ASCII-only, drawn from these glyphs:

```
  Decision marker     ▌ ✦ ✓
  Phase nav           Scope · Sift · Ship
  Status badges       ●  ◐  ◑
  Tasks               · ✓
  Decision log        ›
  Theme toggle        ◐ DARK   ◑ LIGHT
  Box drawing         ┌ ─ ┐ │ └ ┘ ╭ ╮ ╰ ╯
```

No emoji in the rendered HTML except the existing `✓` glyph for done state
(it's monochrome and renders consistently across platforms). Emoji in
markdown documentation is fine.

## Voice

- Lowercase by default in code, slugs, and CLI output. Title case in product
  copy and headings.
- Verbs over nouns. "Sift", not "sifting"; "ship", not "deployment".
- Statements over questions. The terminal is decisive; the page is decisive.
- No marketing buzzwords. No "leverage", "unlock", "elevate", "synergy".
- When you have to caveat, do it once and move on.

## Asciinema cast styling

When recording, set the terminal to:

- 100 columns × 30 rows
- Dark mode terminal
- A monospace font matching the brand stack
- Prompt: `$ ` (dollar + space, no host/path)
- Hide branches in prompt
- Play at 1.5× default speed in the GIF; 1× in the SVG export

See `assets/asciinema/` for cast scripts you can replay or re-record.
