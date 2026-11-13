# UI checks

Headless-browser walks through the real app, used to verify UI changes and to review the
user stories in `framework/03-UX-Framework.md` (results: `reports/UI flow review 2026-11-03.md`).
Each script starts its own server on port 3011 against a data folder you give it, seeds
what it needs through the API, and saves screenshots.

**Never run these on ubuntubot's live checkout or against `./data`.** Use a dev copy. Each
script refuses the app's own `data` folder and any folder that isn't empty.

| Script | What it covers |
|--------|----------------|
| `stories-walk.mjs` | The user stories J1 to J14 (all but J10, which needs the camera) on a phone-sized screen; prints taps, scans, typing and screens per story |
| `fill-check.mjs` | Filling a gridded box: palette, "Empty" tiles, bin pane (no delete), photos, rename, Move a part out of the bin from the pane (list opens beside it), stickers asked for, bin page, desktop panel |
| `stickers-check.mjs` | The Stickers screen with a fake camera playing a QR code (real decoder, beep and buzz); the choice moving to the next bare bin after each sticker; scanner mode (a hardware scan with nothing chosen switches to it, Next up panel, scan-scan-scan, back to Camera); the Settings screen's "Stickers screen starts with" (Scanner, Scanner only) |
| `pages-check.mjs` | Rack and tote pages: which sections show, what list rows say; All places with type chips; moving a place by picking from a list; a rack with numbered positions (set up, drag (the others slide along while dragging), drag in from "not in a position", arrow keys, rename a position, size +/−, fill an empty one from elsewhere or with a new box, shown in search paths); a gridded box's grid size on its page (refused if a placed bin wouldn't fit, the strip follows the front) and on the form |
| `inventory-check.mjs` | The Inventory home and Locations screen: list and tiles, filters, pinned on top, paging, Back to the same spot, focused search, phone and desktop nav, and every tab with Promise-returning scroll methods (newer browsers, DEC-029) |
| `takeout-check.mjs` | Taking a bin out of its box: to a kit or with a note, the grey striped tile, the part's "bin out" line, the kit's list, taking the whole bin by scanning it on a kit, put back by tap and by put-back scan, freeing its spot, desktop pane |
| `photo-check.mjs` | Square photos: a tall upload gets a square thumbnail, the part's page shows a square, Crop on the photo moves and zooms it (original kept), Centre; a second photo in the strip, Use as main, the viewer, Delete; desktop |
| `tiles-check.mjs` | Bin tiles with photos: photo-only small squares framed in the bin colour, wide and tall layouts, "+1", the name of the photo's part, the per-box Photos / Names switch, the desktop name strip |
| `needs-check.mjs` | Fill in details: every part needing details on one page, saving as you go (name, category by typing with arrows/Enter/Tab/Escape and adding a new one, how it's counted, a count with Undo, Plenty/Low/Out), done rows stay with a tick, the More details popup, the photo, desktop columns; the details form's amounts per place and warning wording, and that a part without a category stays on the list |
| `live-check.mjs` | Live updates (DEC-046): two browser contexts as two devices on the same part; a count changed on one shows on the other and on its Inventory list without a reload; a change from neither device reaches both; the writer isn't refetched twice; a tab coming back into view refetches |
| `ai-check.mjs` | AI data fill (DEC-048, on `dev`) with a fake model and search inside the check: the details form's "Suggest details with AI", suggestions with sources and confidence, Use and Use all, a hand-typed value losing its mark, saving, the AI marks on the part's page; a part with its shop link on record read without the search (DEC-049); quick naming over the Needs details list, a guess under each row, Use and Dismiss (DEC-053) |
| `stickers-print-check.mjs` | Print stickers (DEC-052): reached from Locations; the Cricut PNG (SL588 upright in Design Space's 6.76 × 9.26 in box, the image just the 56 labels with no clear edge: 5.875 × 9.075 in, 3525 × 5445 px at 600 dpi, alpha) whose codes scan back with the app's decoder and aren't on anything; 60 turned a quarter turn, a remembered choice; a taller box fits fifteen rows and is remembered ; the title colour drawn and remembered; the die-cut PDF (two Letter pages, ten skipped); the used-codes check; the phone layout |
| `categories-check.mjs` | Categories (DEC-056): add one with fields, rename a field and see the new label on a part's form with its value kept, a field made a Choice with options and the part's form offering them in a drop-down (DEC-059), a text field offering the values other parts hold (DEC-060), remove a field with values (the warning), delete refused while parts use it and allowed once they don't; the link from Locations |
| `bulk-check.mjs` | Bulk editing (DEC-057): Select on Inventory (rows and tiles) and Search, the bar's four actions (category through the picker, move by browsing to a place with everything collapsing there, counting, delete with its confirmation), one undoable entry per part, the phone bar over the nav |
| `places-check.mjs` | Adding several places in a run (DEC-058): Add several from Locations and from a place, a scan saving the place with its sticker, the name counting up, Save without a sticker, a used sticker refused, the type changed mid-run, the number switch off, Done, and a shelf's positions filling in order |
| `where-check.mjs` | Where a part is as a route (DEC-038): numbered stops down the left with the box bold, the rack level in words and as a stack (words only past 16 levels), the box map with the bin the only one in colour and in the right spot, the spot in words, the number small, tapping the map outlines the bin on the box, a bin's own page, a tote (no map), desktop |

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

If `stickers-check.mjs` reports "Couldn't start the camera: Requested device not found", Chrome is refusing to read the fake-camera video it writes into the screenshots folder (seen on ubuntubot with a folder under `/tmp/claude-…`); give it a screenshots folder under your home directory instead.

The checks print `PASS`/`FAIL` lines; the story walk prints a JSON list of stories with their counts and notes.
