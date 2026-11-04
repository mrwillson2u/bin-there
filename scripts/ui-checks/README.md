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
| `fill-check.mjs` | Filling a gridded box: palette, bin pane, photos, rename, stickers asked for, bin page, desktop panel |
| `stickers-check.mjs` | The Stickers screen with a fake camera playing a QR code (real decoder, beep and buzz) |
| `pages-check.mjs` | Rack and tote pages: which sections show, what list rows say |
| `inventory-check.mjs` | The Inventory home and Locations screen: list and tiles, filters, pinned on top, paging, Back to the same spot, focused search, phone and desktop nav |

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
