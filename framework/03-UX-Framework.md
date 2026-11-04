# UX Framework

> **Status:** Draft
> **Last Updated:** 2026-11-02
> **Owner:** Colin

---

## Overview

A **scan-driven, mobile-first** workshop inventory. The most common actions (scan → see contents → +/−, move, check out/in, put back) must take one or two taps, because the previous attempt failed on update friction, not on lookup. Search and browse cover the "where is it?" cases; the put-back bin flow and quick photo capture keep the data current without slowing down actual work.

---

## User Personas

*(Default: one primary persona for a solo project. Viewers, i.e. spouse and friends, are secondary read-only users; see `01-Concept.md`.)*

### Persona 1: Colin, the maker at the bench

| Attribute | Description |
|-----------|-------------|
| **Role/Title** | Hobbyist maker: electronics (PCB runs), hardware, tools |
| **Demographics** | Busy; works in the shop in bursts (heavy ~2 weeks, then 2–3 weeks off) |
| **Goals** | Find parts fast; know if there's enough for a build; keep the shop organized |
| **Pain Points** | Putting things away mid-flow; data drifting out of date; spreadsheet sprawl |
| **Current Tools** | Put-back bin, QR ID stickers, HID barcode scanner, (formerly) Airtable |
| **Tech Comfort** | High: self-hosts a home lab, runs Tailscale, builds his own tools |

---

## User Journey Map

### Primary Flow: Put-back / initial catalog (scan-driven)

Used both for emptying the put-back bin and for the big initial catalog during the clean-out.

```
Enter Put-back mode → Scan a QR sticker → Known item? → +1 returned (tap + for more) → next scan
                                        → Unknown ID? → Quick capture (photo) → next scan
                                                        ↳ later: "Needs details" queue → fill in data
```

| Stage | User Action | System Response | Pain Points | Opportunities |
|-------|-------------|-----------------|-------------|---------------|
| Start | Taps **Put-back mode** | Scan-ready screen; any scan is treated as "returning this" | Must be one tap from anywhere | Pi station could default to this mode |
| Known item | Scans its QR | Opens the record, shows its **home location** and logs **+1 returned**. Big **+ / −** buttons to adjust quantity (e.g. returning 10 = scan once, tap + nine times, or type 10) | Scanning 10 identical items is tedious | Stepper + numeric entry |
| Returnable item | Scans its QR | Checks it **in** (closes the check-out) and shows its home | | Shows where it was used |
| Unknown / new | Scans a fresh, unassigned sticker | **Quick capture**: take a photo, optionally pick a location, save. Done in seconds. Item is flagged **"needs details"** | Data entry mid-clean-out kills momentum | Defer all typing |
| Later | Opens **Needs details** queue | Shows each photo-only item; fill in name, category, consumable/returnable, tracking mode, qty, price, supplier, etc. | | Can be done on the couch, not in the garage |

### Labeling rules & scan resolution

**Who gets a sticker:**
- **Returnable items big enough for a sticker** (e.g. a 12 V power supply) get their **own unique ID sticker**, so each physical unit is tracked individually.
- **Consumables, and items too small for a sticker** (small modules), get **no sticker**. They are recorded (name, photo, type…) and assigned to a bin; the **bin's sticker** is how you reach them.
- **Bins/containers** always get a sticker.
- A bin usually holds **one kind of part**, but sometimes holds **several** (typically same category, limited space).

**What a scan does in put-back mode:**

| Scan | Result |
|------|--------|
| Bin with **one** part type | Default action: **"+1 [part] in this bin"** (one tap to confirm, or just logs it), with +/− to adjust. A small "something else…" option for other actions. |
| Bin with **several** part types | Shows the bin's parts (with photos); **pick which one** is going back, then +/−. |
| **Part sticker** (returnable unit) | Shows where it belongs. If the part has **more than one** possible location, prompt to **scan the bin it's going into** to confirm. If the scanned bin isn't a known location for it, warn ("Not its usual home: put it here anyway / show its homes"). |
| Part sticker → then bin sticker | Explicit "this goes here" pairing. Most reliable when locations are ambiguous. |

**Principle:** the common case (single-type bin, scan, done) is one action; complexity shows up only when the situation is actually ambiguous. Don't over-complicate.

**Outside put-back mode,** scanning opens the thing (J7) with options like add / remove / move / check out, with no automatic +1.

### Item data (beyond quick capture)

Every item should be able to hold: name, photo(s), category, consumable vs. returnable, tracking mode (DEC-001), quantity or level, home location, **price, supplier** (and likely supplier part # / purchase link), notes. Some categories need **type-specific fields** (e.g. screws: thread/length/head; resistors: value/tolerance/package). *(How to support type-specific fields without recreating the Airtable sprawl is a Phase 4 data-model question.)*

---

## Jobs to Be Done

*(Core user stories, captured 2026-11-02. Failing to design around these sank the previous attempt.)*

| ID | Job Statement | Priority | Current Solution |
|----|---------------|----------|------------------|
| **J1 — Find & use** | When I'm mid-project and need a part (e.g. a specific M3 screw), I want to search for it and see how many I have and exactly where (rack → box → bin), then record that I took some, **so I can grab it fast and the count stays correct.** | Must (SPV) | Memory / rummaging |
| **J2 — Put away** | When I have downtime and a **put-back bin** (or end-of-project bin) full of mixed leftovers and new purchases, I want to quickly find each part's existing home, or create a new spot for it, **so everything gets back into the system instead of piling up.** | Must (SPV) | Leftover bin piles up |
| **J3 — Reorganize** | When I rearrange storage (e.g. consolidate all screws into one divided box), I want to move a single item **or a whole group or container** to a new location in one action, **so the app follows the physical change without re-entering everything.** | Should (single-item move in SPV; bulk post-SPV) | n/a |
| **J4 — Project kit** | When I start a project, I want to create a temporary project location and pull parts from all over into it, with each part remembering its home, **so that later (even years later, with the project shelved) a search shows every place that part exists, including that kit.** | **Built 2026-11-03** (DEC-019) | n/a |
| **J5 — Browse a location** | When I look at a storage location, I want to see what's in it. For gridded organizer boxes, I want a **visual grid** showing each bin's size, color and position, **so I can find things by place, not just by search.** | List view in SPV; **grid built 2026-11-03** (DEC-014); **filling a box made quick 2026-11-03** (DEC-020: drag new bins from a palette, tiles show contents, tap a bin for a sheet to add parts) | Open the box and look |
| **J6 — Add new stuff** | When I buy new parts or catalog during the clean-out, I want to add items and assign them a location fast, **so the initial catalog is achievable and new stuff gets in.** | Must (SPV) | n/a |

| **J7 — Scan to open** | When I scan a QR sticker on anything (bin, box, tote, rack, part), I want the app to open *that thing* immediately: a bin's parts, or a box's child bins with their parts, **with quick +/− and move actions right there, so the most common updates happen in one or two taps.** | Must (SPV) | n/a (came up constantly in the last attempt) |
| **J8 — Check out / return** | When I take a **returnable** item (module, 12 V power supply) for a project, I want to check it out to that project/location and check it back in later, **so I can always see where every one of them is and where it was used.** | Should (post-SPV) | n/a |

**Design principle from lessons learned:** the update paths (J1 "use", J2, J3, J6) matter as much as lookup. If updating is a chore, the data drifts and the app dies.

---

## Platform Selection

### Chosen Platform(s)

**Mobile-first responsive web app** (see DEC-002).
- **Primary:** iPhone browser over cell + Tailscale, in the garage.
- **Also works on day one, for free:** any desktop browser, including the Raspberry Pi.
- **Post-ship:** dedicated Raspberry Pi garage station (kiosk-mode browser, USB scanner, Put-back mode as default screen).

**Scanner input:** the scanner acts as a keyboard (USB on the Pi, Bluetooth on the iPhone), so the app has a **scan-ready input** that recognizes fast keyboard bursts ending in Enter as a scan. **Phone camera scanning** is the fallback when the scanner isn't paired.

### Decision Factors

| Factor | Weight | Notes |
|--------|--------|-------|
| User behavior / preferences | High | Used mid-task at the bench, phone in hand |
| Offline requirements | Low | Weak Wi-Fi but fine cell; Tailscale. Tolerate slow links; no full offline mode |
| Device constraints | Medium | Small screen, possibly dirty hands. Scanner as keyboard on both devices |
| Development cost | High | One web codebase serves phone + Pi + desktop |
| Time to market | High | Pi kiosk is just setup work and can follow after ship |

*(Reference decision in 08-Decision-Log.md)*

---

## Accessibility Requirements

| Requirement | Standard | Priority |
|-------------|----------|----------|
*(Personal app: practical defaults tuned for garage use rather than formal compliance.)*

| Requirement | Standard | Priority |
|-------------|----------|----------|
| Large tap targets (dirty hands, quick use) | ≥ 44×44 px; primary +/− buttons larger | Must |
| Color contrast (garage lighting) | WCAG 2.1 AA, 4.5:1 | Must |
| Don't rely on color alone (bin size colors also shown as a size label) | WCAG 1.4.1 | Must |
| Keyboard navigation + visible focus (Pi + scanner are keyboard-driven) | WCAG 2.1 AA | Should |
| Screen reader support | WCAG 2.1 AA | Nice-to-have |

---

## Existing Workflows

Tools and processes users currently rely on:

| Tool/Process | Purpose | Pain Points | Integration Opportunity |
|--------------|---------|-------------|------------------------|
| **Put-back bin** (physical) | Dump things during flow; sort later | Can become a junk pile | First-class "process put-back bin" flow (see Concept) |
| **Pre-printed QR ID stickers** | Label parts/bins/containers with unique IDs | n/a | Scan an unassigned ID → assign it to a thing; scan an assigned ID → open it (J7) |
| **USB/Bluetooth barcode scanner** (HID, 1D + 2D) | Scanning labels | Behaves as a keyboard, so the app needs a "scan-ready" input | Pi station: USB, always-focused scan field. iPhone: Bluetooth HID or phone camera. |
| **Airtable / spreadsheets** (past) | Previous tracking | Sprawl; accuracy decayed | Replaced |

---

## Competitive UX Analysis

| Competitor | Strengths | Weaknesses | Lessons |
|------------|-----------|------------|---------|
| Airtable | Flexible views | Tabs per part type sprawl | Keep one item model; use categories and filters, not separate tables |

---

## Open Questions

- How to support type-specific item fields without Airtable-style sprawl (Phase 4).
- Viewer access path for spouse/friends under Tailscale (Phase 4).
