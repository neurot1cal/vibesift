# Asciinema cast scripts

Three cast scripts, one per phase. Record by replaying the script with
`asciinema rec`, or run the script while `asciinema rec` captures
your terminal.

## Setup (one-time)

```bash
brew install asciinema           # recorder
brew install agg                 # cast → gif
# or:
npm install -g svg-term-cli      # cast → svg (smaller, sharper)
```

## Record all three

```bash
./record-all.sh                  # writes .cast files to ./casts/
./convert-all.sh                 # writes .gif and .svg next to each cast
```

The output files end up at `assets/asciinema/casts/{scope,sift,ship}.{cast,gif,svg}`
and are referenced from the top of the README.

## Cast specifications

| Cast    | Length goal | Key beats                                             |
| ------- | ----------- | ----------------------------------------------------- |
| scope   | ~12s        | bootstrap → init → add-constraint × 2 → decide        |
| sift    | ~15s        | advance → add-option × 3 → rationale → decide         |
| ship    | ~12s        | advance → task add × 3 → task done × 2 → status       |
| full    | ~35s        | all three phases stitched together (the hero clip)    |

## Style

- 100 cols × 30 rows
- Prompt: `$ ` (dollar + space, no host/path)
- Wait 600 ms between commands so the viewer can read each output
- Wait 1200 ms after the final command so the last output stays on screen

## File structure

```
assets/asciinema/
├── README.md            (this file)
├── record-all.sh        (replays the .sh scripts under asciinema rec)
├── convert-all.sh       (cast → gif + svg)
├── scripts/
│   ├── scope.sh
│   ├── sift.sh
│   ├── ship.sh
│   └── full.sh
└── casts/
    ├── scope.cast       (committed)
    ├── scope.gif        (committed, displayed in README)
    ├── scope.svg        (committed, retina-friendly)
    └── … (sift, ship, full each have the same trio)
```

The committed `.cast`, `.gif`, and `.svg` are the publication artifacts.
Re-record any time the CLI surface changes — these are the only place where
visual drift can sneak in.
