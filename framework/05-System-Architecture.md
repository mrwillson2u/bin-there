# System Architecture

> **Status:** Draft (stack proposed, pending confirmation)
> **Last Updated:** 2026-11-02
> **Owner:** Colin

---

## Overview

A single self-hosted Docker container on the home lab server (Ubuntu): a TypeScript Node server that serves a React single-page app and a JSON API, with **SQLite** for data and a mounted volume for photos. Reached over **Tailscale Serve** (HTTPS, tailnet-only) per DEC-003. Built for one user, a flaky garage connection, and $0 running cost.

---

## Architecture Diagram

```
 iPhone (Safari)  ─┐                          Home lab server (Ubuntu)
 BT scanner/camera │                         ┌──────────────────────────────────┐
                   │  HTTPS (*.ts.net)       │  tailscale serve :443 → :3000     │
 Raspberry Pi      ├──── Tailscale ─────────►│  ┌──────────── Docker ──────────┐ │
 USB scanner       │                         │  │ bin-there (Node, :3000)  │ │
                   │                         │  │  • serves React SPA (static) │ │
 Desktop browser  ─┘                         │  │  • /api/* JSON (Hono)        │ │
                                             │  │  • SQLite  /data/app.db      │ │
                                             │  │  • photos  /data/photos/     │ │
                                             │  └──────────┬───────────────────┘ │
                                             │       volume ./data               │
                                             │  nightly backup → second disk/host│
                                             └──────────────────────────────────┘
```

---

## Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Language | **TypeScript** (front + back) | User preference; shared types end to end |
| Frontend | **React + Vite**, React Router, TanStack Query | SPA; installable **PWA** (home-screen icon, cached shell for fast loads on weak signal) |
| Styling | Tailwind CSS | Phase 5 may refine |
| Camera scanning | ZXing-based browser library (e.g. `@zxing/browser` or `html5-qrcode`) | iOS Safari has no native `BarcodeDetector`, so a JS decoder is needed |
| Hardware scanner | Capture-phase keydown interceptor with scanner-configured prefix (see Scanner input) | Works for USB (Pi) and Bluetooth HID (iPhone) |
| Backend | **Node + Hono** | Small, typed, serves both API and static files |
| Validation | Zod | Shared request/response schemas |
| Database | **SQLite** via **Drizzle ORM** (+ FTS5 for search) | One file; trivial backups; plenty for one user |
| Photos | Files on the volume; resized on the phone before upload (DEC-006) | Keep pages light over cell |
| Packaging | One Docker image, `docker compose` | Volume `./data` holds DB + photos |
| Access / HTTPS | Tailscale Serve | DEC-003 |
| Tests | Vitest (unit/API), Playwright (a few key flows) | |

*(See DEC-004.)*

---

## Services / Components

### Component 1: Web app (React SPA)

| Attribute | Value |
|-----------|-------|
| **Purpose** | All UI: scan, search, item/location screens, Put-back mode, quick capture, Needs details |
| **Key behavior** | Scan listener always active; camera-scan button; optimistic +/− updates with undo |

### Component 2: API server (Hono)

| Attribute | Value |
|-----------|-------|
| **Purpose** | CRUD for locations/items/stock/units; scan resolution (`/api/scan/:code`); photo upload; activity log |
| **Key behavior** | Every stock change happens inside a transaction that also writes an activity event |

### Component 3: Backup job

| Attribute | Value |
|-----------|-------|
| **Purpose** | Nightly `sqlite3 .backup` + photo sync to a second disk or machine; keep N days |
| **Implementation** | Built into the app (DEC-008): SQLite online backup → `BACKUP_DIR/snapshots/<time>/app.db`, integrity-checked, newest 14 kept; photos synced to `BACKUP_DIR/photos`. Runs nightly at `BACKUP_HOUR` and on start if the last good backup is >24 h old. Status on the Activity screen. **Destination: a second drive on the server** (interim). Will move to the user's main backup system once that's fixed. |

---

## Scanner input (keeping scans out of text fields)

**Problem:** the scanner types like a keyboard. Detecting the scan on `input`/`keyup` or on the suffix is too late, because characters are already in the focused field.

**Approach (layered):**
1. **Scanner-configured prefix** (set via the scanner's config barcodes): a key never typed by hand, e.g. `Ctrl+B` (STX) or a rare character. Applies to *all* barcodes, including product UPCs. Suffix = Enter.
2. **Capture-phase interception:** `window.addEventListener('keydown', onKey, { capture: true })`. On the prefix → enter *scan mode*; while in scan mode, `preventDefault()` + `stopPropagation()` on every keydown and append `e.key` to a buffer. This stops insertion into any focused field. Exit on Enter (dispatch scan) or ~100 ms idle timeout (discard/dispatch).
3. **Timing fallback** (no prefix configured): keys < ~30 ms apart ending in Enter, at least N characters → treat as a scan, and strip the leaked leading characters from the focused field. Fallback only.
4. **Code format validation:** own stickers match a known pattern (e.g. `SNT-000123`); other codes are treated as product barcodes; malformed → ignored with a toast.
5. **Single dispatcher:** the interceptor and the camera scanner both call the same `onScan(code)` → `GET /api/scan/:code`.

**Scanner hardware:** **Tera HW0006 Pro** (confirmed 2026-11-02; manual `TR-UMHW0006 Pro` Ver.04.1.01, read 2026-11-02). Findings from the manual:

| Capability | Manual page | Use |
|---|---|---|
| **Bluetooth HID** (keyboard) | p.8 | iPhone, SPV |
| **iOS virtual keyboard toggle** ("Pull trigger twice to show/hide keyboard On") | p.11 | Fixes iOS hiding the on-screen keyboard |
| **BT HID transfer rate** Fast / Medium* / Slow / Ultra-slow | p.11–12 | Keep at Medium or Fast; Slow would defeat the timing fallback |
| **Prefix/suffix incl. control chars** via Escape Character Set 0–3 + Appendix A | p.13–16, 42+ | **Prefix = STX sent as `Ctrl+B`**: scan *Escape Character Set 2* → *Add Prefix* → *STX* symbol (App. A, p.42) |
| **Terminator** CR / LF / CR&LF / Tab / None | p.21 | Keep CR (Enter) |
| **USB-COM / Virtual COM port** (non-typing) | p.7 | **Pi station: Web Serial in Chromium**, so scans never pass through keyboard input. *(Unverified whether it works over the 2.4 GHz dongle or wired only.)* |
| **Bluetooth SPP / BLE** (non-typing) | p.9–10 | BLE could work with Web Bluetooth in Chromium (Pi/desktop). **Not on iPhone**: iOS Safari has no Web Bluetooth/Serial, so the iPhone stays on HID |
| 2.4 GHz dongle | p.7–8 | Pi alternative to Bluetooth |

**Device roles (revised 2026-11-02):** iPhone → **camera only**. Hardware scanner → desktop/Pi browser: keyboard (HID) mode + Ctrl+B prefix in the SPV; **USB-COM + Web Serial** for the Pi station post-ship. No iOS browser supports Web Serial/Bluetooth/USB (all iOS browsers are WebKit), so BT-HID-on-iPhone is dropped as a goal; the interceptor still guards against it if a scanner is ever paired.

**Risks to verify at M1:** iOS Safari delivering hardware-keyboard keydown events with no field focused, and `preventDefault` reliably suppressing insertion. iOS hides the on-screen keyboard while a BT HID device is connected (most scanners have a toggle). Pi alternative post-ship: USB-COM mode + Web Serial (confirmed in manual). Also verify iOS doesn't swallow `Ctrl+B` before Safari sees it; fallback prefix = a rare printable char.

---

## Data Flow

### Primary Flow: Scan → act

1. Scanner/camera produces a code → SPA calls `GET /api/scan/:code`
2. Server resolves it: **location**, **unit** (stickered returnable), or **unassigned**
3. SPA shows the matching screen (or Put-back behavior, see `03-UX-Framework.md`)
4. +/− / move / check-in → `POST` a stock action → server applies it + logs the event in one transaction → SPA updates (optimistic, with undo)

---

## Communication Patterns

Synchronous JSON over HTTPS only. No queues, no websockets for the SPV.

---

## Non-Functional Requirements

*(Solo MVP defaults: managed baselines, no formal SLAs.)*

### Scalability
One user, a few thousand items, tens of thousands of events. SQLite is far beyond sufficient.

### Reliability
- Nightly backups (DB + photos); one restore test before ship (PRD F8)
- Container `restart: unless-stopped`
- SQLite in WAL mode

### Security
- Not exposed to the internet; tailnet-only (DEC-003). No app login in the SPV.
- Later viewer access: Cloudflare Tunnel + Access, with the app reading the verified identity header to assign an owner/viewer role.

### Performance (weak garage connection)
- PWA shell cached, so only API calls hit the network
- Thumbnails served for lists; full photos on demand
- Scan → screen in < 1 s on a decent cell connection

### Observability
Container logs (stdout) + a `/api/health` endpoint. The activity log doubles as the usage metric source.

---

## Infrastructure

### Hosting
Home lab server, Ubuntu, Docker Compose. `tailscale serve` maps HTTPS 443 → container port.

### Deploy
Build the image locally or on the server, then `docker compose up -d`. *(Optional later: GitHub Actions builds the image, Watchtower pulls it.)*

---

## Third-Party Dependencies

| Dependency | Purpose | Cost |
|------------|---------|------|
| Tailscale | Network + HTTPS | Free (personal) |
| Cloudflare Tunnel + Access | Viewer access (post-ship) | Free tier; domain ~$10/yr if not owned |
| Local LLM (e.g. Ollama on the server GPU) or cloud API | AI features (post-ship) | $0 local / pay-per-use cloud |

---

## Open Questions

- ~~Backup destination~~: a second drive on the server for now; switch when the home backup system is fixed. Note that the same machine is a single point of failure until then.
- Next.js instead of a Vite SPA + Hono? *(Not recommended: no SSR or SEO need, and it's heavier. See DEC-004.)*
