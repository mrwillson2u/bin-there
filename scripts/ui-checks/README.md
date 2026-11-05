# UI checks

Headless-browser walks through the real app, used to verify UI changes and to review the
user stories in `framework/03-UX-Framework.md` (results: `reports/UI flow review 2026-11-03.md`).
Each script starts its own server on port 3001 against a data folder you give it, seeds
what it needs through the API, and saves screenshots.

**Never run these on ubuntubot's live checkout or against `./data`.** Use a dev copy. Each
script refuses the app's own `data` folder and any folder that isn't empty.

| Script | What it covers |
|--------|----------------|
| `stories-walk.mjs` | The user stories J1 to J14 (all but J10, which needs the camera) on a phone-sized screen; prints taps, scans, typing and screens per story |
| `fill-check.mjs` | Filling a gridded box: palette, "Empty" tiles, bin pane (no delete), photos, rename, stickers asked for, bin page, desktop panel |
| `stickers-check.mjs` | The Stickers screen with a fake camera playing a QR code (real decoder, beep and buzz) |
| `pages-check.mjs` | Rack and tote pages: which sections show, what list rows say; All places with type chips; moving a place by picking from a list; a rack with numbered positions (set up, drag (the others slide along while dragging), drag in from "not in a position", arrow keys, rename a position, size +/−, fill an empty one from elsewhere or with a new box, shown in search paths) |
| `inventory-check.mjs` | The Inventory home and Locations screen: list and tiles, filters, pinned on top, paging, Back to the same spot, focused search, phone and desktop nav, and every tab with Promise-returning scroll methods (newer browsers, DEC-029) |
| `takeout-check.mjs` | Taking a bin out of its box: to a kit or with a note, the grey striped tile, the part's "bin out" line, the kit's list, taking the whole bin by scanning it on a kit, put back by tap and by put-back scan, freeing its spot, desktop pane |
| `photo-check.mjs` | Square photos: a tall upload gets a square thumbnail, the part's page shows a square, Crop on the photo moves and zooms it (original kept), Centre; a second photo in the strip, Use as main, the viewer, Delete; desktop |
| `tiles-check.mjs` | Bin tiles with photos: photo-only small squares framed in the bin colour, wide and tall layouts, "+1", the name of the photo's part, the per-box Photos / Names switch, the desktop name strip |
| `needs-check.mjs` | Fill in details: every part needing details on one page, saving as you go (name, category by typing with arrows/Enter/Tab/Escape and adding a new one, how it's counted, a count with Undo, Plenty/Low/Out), done rows stay with a tick, the More details popup, the photo, desktop columns; the details form's amounts per place and warning wording, and that a part without a category stays on the list |

Setup, once per dev copy (needs `ffmpeg`, and a Chromium; Playwright's headless shell works):

```bash
npm install
npm install --no-save playwright
npx playwright install chromium-headless-shell
npm run build
```

Run one (each needs its own new, empty data folder):

```bash
export CHROME=$(ls -d ~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell | tail -1)
mkdir -p /tmp/ui/data /tmp/ui/shots
node scripts/ui-checks/stories-walk.mjs "$PWD" /tmp/ui/data /tmp/ui/shots
```

The checks print `PASS`/`FAIL` lines; the story walk prints a JSON list of stories with their counts and notes.
