# Product Requirements Document

> **Status:** Draft
> **Last Updated:** 2026-11-04
> **Owner:** Colin

---

## Overview

Bin There is a self-hosted, mobile-first web app for my garage workshop inventory. It is **scan-driven**: QR stickers on bins, containers and larger returnable items open the right record instantly, from a USB/Bluetooth scanner or the phone camera. The MVP centers on the loop that failed last time: **catalog → find → use → put back**, with as little update friction as possible so the data stays true. Stories J1–J8 are in `03-UX-Framework.md`.

---

## MVP Scope

### In Scope

| Feature | Description | Priority | Acceptance Criteria |
|---------|-------------|----------|---------------------|
| **F1. Scan anywhere** | Scanner-as-keyboard input + a camera-scan button wherever scanning is possible | Must-have | See Feature Details |
| **F2. Locations & stickers** | Nested containers (rack → box/tote → bin); assign sticker IDs; list contents | Must-have | See Feature Details |
| **F3. Items & stock** | Item records; consumable/returnable; exact/level tracking (DEC-001); stock per location; home location | Must-have | See Feature Details |
| **F4. Scan/search → use** (J1, J7) | Find a part, see qty + full location path, +/−, move a single item | Must-have | See Feature Details |
| **F5. Quick capture + Needs details** (J6) | Scan new sticker + photo → saved in seconds; fill in later | Must-have | See Feature Details |
| **F6. Put-back mode** (J2) | Scan-driven return flow with home-location display and ambiguity handling | Must-have | See Feature Details |
| **F7. Activity log** | Every stock change recorded (what, where, qty, when) | Must-have | Needed for undo, staleness, and success metrics |
| **F8. Backups** | Automated database + photo backup | Must-have | Nightly backup runs; restore tested once |
| **F9. Bulk move** (J3) | Move a whole container (with everything in it) or a selected group of items | Should-have | Moving a box moves all of its bins and contents in one action |
| **F12. Sites** (added 2026-11-03) | More than one place to keep things (garage, basement, office…) | Should-have | Sites are the top level; everything lives in a site; paths and search show the site; with one site, Home shows it directly (DEC-010) |
| **F11. Pins** (added 2026-11-03) | Pin parts or containers you're actively working with; they show at the top of Inventory and Locations | Should-have | Pin/unpin from any item or location screen; pinned parts sit on top of Inventory (home) and pinned places on top of Locations, newest first (DEC-026); pinned parts have their own − / + in the list (for their home location); pins are the same on every device |
| **F13. Find it in put-back** (added 2026-11-03) | For sticker-less parts you can't place: search by name/value with photos and home paths, plus a "Recently taken out" list (parts with − in the last 30 days) | Should-have | Search or tap a recent part → its home → one tap puts it back |
| **F10. Check out / check in** (J8) | Returnables checked out to a location/project and back, with history | Should-have | "Where are all my 12 V supplies?" shows each unit's current place and last use |

### Out of Scope (for MVP)

- Project kits as temporary locations (J4)
- ~~Visual grid view of gridded organizer boxes (J5)~~ built post-ship, 2026-11-03 (DEC-014).
- Accounts / viewer access for spouse and friends
- Raspberry Pi kiosk setup (the Pi works as a normal browser from day one; DEC-002)
- AI assistant and AI data fill
- Lending tracking for friends
- Generating new QR sticker sheets (existing sticker sheets are already designed)

---

## Post-Ship Backlog

| Feature / Idea | Added | Why It Can Wait |
|----------------|-------|-----------------|
| ~~**Project kits** (J4)~~ | 2026-11-02 | **Built 2026-11-03** (DEC-019): kits on Locations (Home until DEC-026); pull parts in by search or by scanning a part or bin; − for what's used up; Return / Finish send the rest home |
| ~~**Visual grid view** (J5) for gridded organizer boxes~~ | 2026-11-02 | **Built 2026-11-03** (DEC-014): the box screen draws the 6 × 4 grid + front strip with bins in their colors; Arrange mode places them by drag-and-drop with snapping. **2026-11-03** (DEC-020): new bins are dragged in from a palette, numbered automatically, show their contents on the tile, and a tap opens a sheet to add parts without leaving the box. Not yet: a way to set a different grid size per box (data supports it) |
| **Viewer access** for spouse / friends (read-only search + location), via accounts or a lighter mechanism | 2026-11-02 | Owner-only use proves the app first |
| **Pi garage station**: kiosk browser, USB scanner, Put-back mode as default. Option: put the HW0006 Pro in **USB-COM (virtual serial) mode** and read it via Web Serial in Chromium, so scans never pass through keyboard input at all | 2026-11-02 | Setup only, no app rework (DEC-002) |
| **AI assistant chat**: preset "inventory assistant" prompt; finds parts and suggests what I have during a conversation; nudges ("put-back bin hasn't been emptied in 9 days") | 2026-11-02 | Needs a stable data model + activity log first. ⚠️ **Conflicts with $0 running cost**: cloud LLM APIs cost money per use; a local model on the home lab server is free but weaker. Decide before building. |
| **Identify a part from a photo** in put-back mode (snap the mystery capacitor, get likely matches from the catalog photos) | 2026-11-03 | Search + "recently taken out" covers most cases. Researched 2026-11-03 (`reports/Self hosted photo part search.md`): feasible at $0 as a hybrid (DINOv3 image embeddings on CPU + a small Qwen VLM reading markings), judged as "right item in the top 5". Phase 0 = offline go/no-go eval on ~50 of the user's own parts. Server GPU: **GTX 1080 Ti, 11 GB** (Pascal) → fits qwen3-vl:8b-instruct or qwen3.5:9b at Q4 via Ollama/llama.cpp (not vLLM, which needs a newer GPU); expect slower than the report's RTX 4060 timings; the user's other Qwen project is on a different machine; this server's GPU shares with Frigate (mostly uses a Coral, ~0.5 GB) and the `neutts` TTS container (~5 GB, unused; Colin is fine taking it down when photo search needs the room) |
| **AI data fill**: look up part number, supplier, price, specs (web search; possibly from the quick-capture photo) and suggest values for "needs details" items | 2026-11-02 | Same cost question as above; manual fill-in works for the MVP |
| ~~**Recount flow + staleness review** list~~ | 2026-11-02 | **Built 2026-11-03** (DEC-015): Home shows "N counts worth checking" → a list grouped by location with one-tap "Still N" or a new number |
| ~~**Low-stock / shopping list**~~ | 2026-11-02 | **Built 2026-11-03** (DEC-016): Home shows "N running low" → the list, with Copy as text. Exact items get a per-item low-stock warning on the edit screen |
| **"Do I have enough for N boards?"** (BOM check against exact-mode items) | 2026-11-02 | Depends on exact counts being trusted first |
| **Lending tracking** (who borrowed what) | 2026-11-02 | Needs viewer accounts first |
| ~~**Light mode** theme~~ | 2026-11-02 | **Built 2026-11-03** (DEC-018): Device / Dark / Light at the bottom of Locations (Home until DEC-026) |
| Look at Homebox / InvenTree / PartKeepr for ideas | 2026-11-02 | Inspiration only |
| ~~**Purge old deletions**~~ | 2026-11-03 | **Built 2026-11-03** (DEC-017): items deleted over 30 days ago are removed for good (photos, stock, units, history, row) nightly and on start. Decided against a second, real delete button (see DEC-013) |
| ~~**Delete / archive** items and locations~~ | 2026-11-03 | **Built 2026-11-03** (DEC-013): soft delete from the item edit screen (undoable) and from an empty location's screen. Was missing from the SPV; found in the post-ship audit |

---

## Feature Details

### F1: Scan anywhere

**User Story:** As the owner, I want to scan with whatever's at hand (Bluetooth scanner, USB scanner on the Pi, or the phone camera) so that scanning is always one action.

**Acceptance Criteria:**
- [ ] A scanner acting as a keyboard is recognized as a scan from any screen, without first tapping a field
- [ ] **Scanned characters never land in a text field**, even when one has focus (scanner-configured prefix + capture-phase keydown interception; see Architecture: Scanner input)
- [ ] Typing by hand (on-screen or a real keyboard) is never mistaken for a scan
- [ ] **iPhone = camera scanning.** Hardware scanner verified in a desktop/Pi browser by M1 (2026-11-08). Bluetooth scanner on the iPhone is not a goal: no iOS browser can read serial/Bluetooth, and the camera is the preferred phone workflow
- [ ] Every screen where scanning makes sense has a **camera-scan button** that opens the phone camera and gives the same result as the hardware scanner
- [ ] Reads the existing QR sticker IDs (and 1D barcodes if present)
- [ ] Scanning an **assigned** ID opens that thing (F4); scanning an **unassigned** ID starts assignment / quick capture (F5)

**Notes:** Phone camera access in the browser requires **HTTPS**, which must be solved in Phase 4 (e.g. Tailscale-issued certificates).

### F2: Locations & stickers

**Acceptance Criteria:**
- [ ] Create containers of a type (rack, gridded box, tote, tub, bin, other) nested to any depth
- [ ] Assign a sticker ID to a container by scanning it
- [ ] A container screen lists its child containers and the items in it, with a breadcrumb path (Rack A → Box 3 → Bin 7)
- [ ] Bins record their size (1×1 red, 2×1 yellow, 2×2 blue, front strip, other) and show a colored chip with the size label (color alone isn't enough)

### F3: Items & stock

**Acceptance Criteria:**
- [ ] An item has: name, photo(s), category, consumable/returnable, tracking mode (exact/level), home location(s), notes, and optional price, supplier, supplier part #, link
- [ ] Tracking mode defaults from the category and can be changed per item (DEC-001)
- [ ] Stock is recorded **per location**, so one item can be in several places
- [ ] Stickered returnable units are tracked individually (each 12 V supply is its own unit with its own sticker)
- [ ] Each stock record has a **last counted** date; exact counts are flagged "stale" past a threshold or after heavy use
- [ ] Optional category-specific fields (e.g. screw thread/length; resistor value/package) without a separate table per part type (Phase 4 design)

### F4: Scan/search → use

**Acceptance Criteria:**
- [ ] Search by name/category/fields returns items with total quantity and **every location** with its full path
- [ ] From an item or container screen: **+ / −** in one tap each (exact) or plenty/low/out (level)
- [ ] Move a single item (or some of its quantity) to another location by scanning the destination
- [ ] Scan a single-item bin → that item's +/− is right there; scan a multi-item bin → the list, then tap an item
- [ ] Every change is undoable for a short time (backed by F7)

### F5: Quick capture + Needs details

**Acceptance Criteria:**
- [ ] Scan an unassigned sticker (or tap "new") → take a photo → optionally scan/pick a location → saved, in **≤ 3 taps after the scan**
- [ ] Items without required details appear in a **Needs details** queue with their photo
- [ ] A consumable with no sticker of its own can be quick-captured by scanning the bin it's going into

### F6: Put-back mode

**Acceptance Criteria:**
- [ ] One tap from the home screen to enter Put-back mode
- [ ] Scan a single-item bin → logs +1 of that item (stepper/number to adjust)
- [ ] Scan a multi-item bin → choose the item, then quantity
- [ ] Scan a part sticker → shows its home(s); if there are several, prompts to scan the destination bin; warns if the bin isn't a known home ("put it here anyway?")
- [ ] Scanning a checked-out returnable checks it back in (once F10 exists)
- [ ] Unknown sticker → quick capture (F5) without leaving the mode

---

## Success Metrics

*(From `01-Concept.md`; measured over the 2 months after the SPV ships. Shop use is bursty, so metrics follow active stretches.)*

| Metric | Definition | Target | Measurement Method |
|--------|------------|--------|-------------------|
| Active use | Active shop stretches with zero app updates | 0 | Activity log + self-check at 2 months |
| Put-back bin cleared | Bin emptied after each active stretch | Within 1 week of stretch end | Self-check / activity log |
| Accuracy | 10 random items: location correct (exact counts within ±10%) | ≥ 9/10 | Spot-check at 2 months |
| Catalog complete | Clean-out containers present in app with contents | 100% | Self-check at end of clean-out |

---

## Timeline & Milestones

| Milestone | Target Date | Description |
|-----------|-------------|-------------|
| M1: Walking skeleton | 2026-11-08 | Docker container on the home lab server at the Tailscale HTTPS URL; iPhone camera scans a real sticker and the app shows "unassigned code X". Locations: create, nest, assign a sticker, scan to open |
| M2: Core inventory | 2026-11-15 | Items + stock (exact/level), quick capture with photo, Needs details queue, search with full location paths, +/− and single-item move with undo, activity log. **Start cataloging with it** |
| M3: Put-back + hardening | 2026-11-21 | Put-back mode (all scan cases), scanner tested on the desktop/Pi browser, PWA install, nightly backup to second drive + one restore test |
| **SPV Ships** | **2026-11-23** | SPV definition met item by item (see Ship Target) |

---

## Integration Requirements

| System | Integration Type | Purpose | Priority |
|--------|-----------------|---------|----------|
| Barcode scanner (USB / Bluetooth HID) | Keyboard input | Scanning | Must |
| Phone camera | Browser camera API (needs HTTPS) | Scanning + photos | Must |
| Tailscale | Network access | Reach the home lab server from the garage over cell | Must |
| LLM provider (local or cloud) | API | AI assistant / data fill | Post-ship |

---

## Open Questions

- AI features vs. $0 running cost: local model or paid API? (Post-ship, decide before building.)
- ~~Which item fields are required before an item leaves "Needs details"?~~ Resolved: DEC-007.

---

## Changelog

| Date | Author | Changes |
|------|--------|---------|
| 2026-11-02 | Colin + AI | Initial draft from discovery Phases 1–3 |
| 2026-11-03 | AI | Post-ship: delete/archive added (DEC-013) |
| 2026-11-03 | AI | Post-ship: grid view of gridded boxes built (DEC-014) |
| 2026-11-03 | AI | Post-ship quick wins: staleness review (DEC-015), low-stock list (DEC-016), purge of old deletions (DEC-017), light mode (DEC-018) |
| 2026-11-03 | AI | Post-ship: project kits built (DEC-019) |
| 2026-11-03 | AI | Post-ship: filling a gridded box made low-friction: palette, numbered bins, contents on tiles, bin sheet (DEC-020) |
| 2026-11-03 | AI | Post-ship: camera scanner rebuilt (zxing-wasm / BarcodeDetector, plain back lens, full-resolution guide crop) and a Stickers run to label a box of bins (DEC-021) |
| 2026-11-03 | AI | Post-ship: Stickers reworked to tap a bin, aim, tap Scan, with brackets, beep and buzz, move-and-undo for mix-ups (DEC-022); bin IDs global and fixed-width, Bin 0001 (DEC-023) |
| 2026-11-03 | AI | Post-ship: screens lead with what's there (DEC-024). The bin sheet shows the part's photo, name and count, with adding behind "Add another part" once a bin has something; sticker codes only on a location's own page; location pages put contents first and sticker/move/delete at the bottom; rename a location from its page; desktop opens a bin beside the grid |
| 2026-11-03 | AI | Post-ship: user stories J9 to J14 added and all fourteen walked through the app (`reports/UI flow review 2026-11-03.md`); a scan in the bin pane asks before putting a sticker on (DEC-025); paths keep the bin visible; pick-from-list opens beside the part; saving details goes back |
| 2026-11-04 | AI | Post-ship: home is the Inventory, every part with search, filters (needs details, running low, checked out, counts to check, category, kind), sort, list or tiles, pinned parts on top; the old home is the Locations screen; Search lists only matches (DEC-026) |
| 2026-11-04 | AI | Post-ship: Locations gets an All places list with type filters and find; a place can be moved by picking from a list (no sticker needed); the bin quick view has no delete; empty bins say "Empty"; nine more starter categories (batteries, resistors, capacitors, inductors, diodes, LEDs, transistors, ICs, switches) with their own fields, no sub-categories for now (DEC-027). "Needs details" keeps needing a name and a category (DEC-007, Q47) |
| 2026-11-04 | AI | Post-ship: a bin can be taken out of its box to a project kit or with a note, keeping its grid spot (grey and striped, "Out · kit"); put back by a tap, from the kit, or by scanning it in put-back; its spot can be freed for a new bin; scanning a bin on a kit's screen offers the whole bin (DEC-028, Q49) |
| 2026-11-04 | AI | Fix: leaving Inventory on desktop turned the page black (an effect returned the Promise newer browsers give from `scrollTo`); a crashing screen now shows a message with Reload instead (DEC-029) |
| 2026-11-04 | AI | Post-ship: photos show as squares everywhere, the part's page included; thumbnails are cut square from the centre; "Adjust crop" on the part's page moves and zooms the square; the original is kept (DEC-030) |
