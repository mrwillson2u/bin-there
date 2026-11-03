# Concept Document

> **Status:** Draft
> **Last Updated:** 2026-11-02
> **Owner:** Colin

---

## Problem Statement

My garage workshop has a lot of parts, tools and supplies spread across many kinds of storage: gridded organizer boxes with modular bins, lidded totes on racks, large tubs. Mid-project, I can't quickly answer: *"Do I have an M3 screw of this size, how many, and where exactly is it?"* After a project, putting leftovers and new purchases away is slow and inconsistent, so the next lookup gets less reliable.

**Catalyst:** a big clean-out and reorganization of the workbench and garage. Because everything is getting handled anyway, it's the cheapest moment to catalog it.

### Lessons from the previous attempt

*(A previous attempt failed. It is not referenced; only these lessons carry over.)*

1. **It wasn't designed from user stories.** It wasn't built around how I actually use the workshop day to day. This time the core stories are written down first (see Jobs to Be Done in `03-UX-Framework.md`).
2. **Lookup worked; keeping it current did not.** Searching for a part was mostly solved. The failure was that inventory drifted out of date because recording usage, put-aways and moves was too much friction. **Keeping data current with low effort is the #1 design priority.**

## Vision

I can search for any part from my phone at the bench and immediately see how many I have, every place it lives (including kits set aside for shelved projects), and exactly which rack → box → bin to open. Taking parts out, putting them away and reorganizing take only a tap or two, so the inventory stays true without a chore.

**One-liner:** An inventory app for a home garage workshop, so I can find and keep track of the things I own.

## Target Users

Who are the primary and secondary users?

| User Segment | Description | Key Need |
|---|---|---|
| **Owner (primary)**: Colin | Maker with a garage workshop: electronics (PCB runs), fasteners, tools, general hardware. Uses it at the bench, mostly on a phone. | Find, use, put away and reorganize parts with minimal friction. Accurate counts for critical parts. |
| **Household viewer (secondary)**: spouse | Occasionally needs to know *if* we have something and *where* it is | Simple read-only search and location. No editing required. |
| **Friends / borrowers (secondary)**: friends who borrow tools | Want to see what's available to borrow | Read-only browsing. *(Possible later: lending / "who has it" tracking.)* |

## Goals & Success Metrics

**Overall success:** the app is still in active use and the workshop is still organized **2 months after the app is functional** (i.e. 2 months after SPV ships). Organizational systems usually fail when I'm in the flow of working and putting things away feels like too much effort.

*(Confirmed 2026-11-02. Shop use is bursty: heavy for ~2 weeks, then possibly nothing for 2–3 weeks, so metrics are tied to **active stretches**, not calendar weeks.)*

| Goal | Metric | Target |
|---|---|---|
| Still actively using it | Active workshop stretches in the 2 months after ship where I logged **zero** app updates (self-check against the app's activity log at the 2-month mark) | 0. Every stretch has updates. *(Guideline only: weekly activity during busy stretches.)* |
| Put-back bin doesn't become a junk pile | Put-back bin emptied (0 items) | Emptied within 1 week after each active stretch ends |
| Data matches reality | Spot-check of 10 random items at the 2-month mark: location correct (and, for exact-mode items, count within ±10%) | ≥ 9 / 10 |
| Workshop catalogued | Every storage container from the clean-out exists in the app with its contents | 100% by end of clean-out |

### Key behavior: the put-back bin

When I'm in the flow, I don't stop to put things away; things go in a physical **put-back bin**, and I sort it later during downtime. The app should treat this as a first-class workflow, not fight it:
- Using or pulling items can send them to the put-back bin with one tap.
- A "process put-back bin" mode walks through each item and shows its home location (or helps create one) so put-away is fast.
- **Principle: a place for everything.** Every item has a designated home, so putting things away means looking it up, not making a decision.

## Constraints

- **Timeline:** Kickoff 2026-11-02, alongside the garage clean-out. Hard ship date set in Phase 6.
- **Budget:** **$0 running cost.** Self-hosted, no paid services, no new networking hardware for now.
- **Compliance:** None (personal app).
- **Technical:**
  - **Hosting:** runs on my existing **home lab server**: **Ubuntu**, apps in **Docker**. Has a modest **GPU** (could run a small local LLM for post-ship AI features at $0).
  - **Access:** over **Tailscale**. Garage Wi-Fi is weak, but cell signal is fine, so the phone on cell + Tailscale is the main way in from the garage.
  - **Clients:** **mobile-friendly web** is required. Later, a **Raspberry Pi with a screen** in the garage as a fixed station (kiosk-style).
  - **Flaky network:** pages should be lightweight and handle slow or dropped connections gracefully. *(Full offline mode: TBD, probably not needed given cell + Tailscale.)*
  - **Sharing with others** (spouse, friends) must work within self-hosting + Tailscale. They'd need to be on the tailnet (Tailscale sharing) or need some other access path. Decide in Phase 4.
  - **Future:** stronger garage Wi-Fi someday; not assumed.

## Risks & Unknowns

*(Drafted by AI from discussion so far; confirm or edit.)*

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Data drifts out of date** (killed the last attempt) | High | High | Update paths are first-class: one-tap use, put-back bin flow, bulk moves, level mode for bulk items, staleness flags (DEC-001) |
| **Initial cataloging is too big a job**, so I quit before the app is useful | High | High | Fast bulk-add flow during the clean-out. Catalog container by container. Level mode means no counting nails. |
| **Over-building before shipping** (gridded box visualizer, Pi kiosk, sharing, lending…) | Medium | High | Hard SPV + ship date in Phase 6. Extras go to the post-ship backlog. |
| **Over-modeling part types** (Airtable sprawl repeated) | Medium | High | One item model with a small set of attributes (category, consumable/returnable, tracking mode), not a table per part type |
| **Garage connectivity** makes the app slow, so I skip using it | Medium | Medium | Cell + Tailscale; lightweight pages; tolerate dropped requests |
| **Home lab server downtime / data loss** | Low | High | Automated backups of the database (free, local + another machine) |

## Competitive Landscape

What exists today? How is this different?

| Competitor | Strengths | Weaknesses | Our Differentiator |
|---|---|---|---|
| **Airtable / visual databases** (tried) | Flexible, quick to start, works well in some ways | Sprawls. Different part types end up in different tabs, it gets unruly, and accuracy decays | One coherent model built around *my* storage and workflows; update paths built in |
| **Spreadsheets** (tried) | Free, familiar | Same sprawl; no scanning; no nesting of containers | Same as above |
| **Unnamed paid app** (seen, not used) | Pretty good, looked self-built | Generic; not free | Free, self-hosted, tailored to my bins/boxes and scanner |
| **Homebox, InvenTree, PartKeepr** (not yet evaluated) | Free, self-hostable, mature | Unknown fit | `[TBD]` Worth a 15-min look before building, to steal ideas, not to adopt |

### Existing assets to design around

- **QR / barcode stickers:** I already designed sticker sheets of **pre-printed unique IDs**. An ID means nothing until I assign it to a part, bin or container in the app.
- **Barcode scanner:** reads 1D and 2D codes. Works over **USB as a keyboard (HID)**, ideal for the garage Raspberry Pi, and also over **Bluetooth**, so it could pair with the iPhone.

### Part types: consumable vs. returnable

Two kinds of things, which behave differently:
- **Consumable:** used up and not returned (nails, screws, resistors). Using it removes stock. (Counting style per DEC-001.)
- **Returnable:** checked out for a project and expected back (modules, 12 V power supplies, dev boards). Taking it out is a **check-out**: record where it went (project / location) and when. Bringing it back is a **check-in**. History is kept, so a year later "where are all my 12 V supplies?" shows each one's current place, including inside shelved projects.

## Domain Notes: Storage

Storage is **nested**: racks hold boxes and totes, and boxes hold bins. The app must model containers inside containers.

| Storage type | Description | Notes |
|---|---|---|
| **Gridded organizer box** | Allit economy modular storage case (365 × 292 × 55 mm), a 6 × 4 grid + front strip. Modular bins drop in. | Similar in idea to Gridfinity but **not** Gridfinity: specific to the bins I own. I want a visual grid view of the box showing where each bin sits. |
| **Modular bins** | Allit economy modular storage case bins (Lee Valley #70869). **1×1 red (51 × 51 mm), 2×1 yellow (105 × 51), 2×2 blue (105 × 105)**, plus a full-width **front strip** bin (346 × 46). The case is a **6 × 4 grid** + front strip. These are the only bin types. | **Color-coded by size.** Easy to move a bin from one box or slot to another. |
| **Lidded totes** | Home-Depot-style yellow-lid totes, about 12" × 8" × 7–8" tall | A rack is planned to hold them. |
| **Large tubs** | Big storage tubs | |
| **Racks** | Racks for totes, and racks for gridded boxes | Top-level locations |
| **Project kit** *(virtual/temporary)* | A box/bin holding parts pulled for a specific project | Acts as a location. Parts in it remember their home location. |
| *Others* | A few other storage types exist | `[TBD — not needed for now]` |

## Open Questions

- ~~How exact do quantities need to be?~~ → Proposed: per-item **exact** or **level** mode, defaulted by category, with a last-counted date (see DEC-001).
- Does an item in a project kit have a "home" location plus a "current" location, or is it simply stock split across two locations? *(Leaning: stock can be in several locations, and each item has one designated home.)*
- ~~Grid dimensions / bin sizes~~: resolved 2026-11-02 (6 × 4 grid + front strip; 1×1, 2×1, 2×2 only).
- Access for others: full user accounts with roles (owner / viewer), or something lighter like a shared read-only link? Is lending tracking wanted, and when? *(Leaning: owner-only for the first ship; viewer access soon after. Decide in Phase 3/4.)*
- How specific are part identities? For example, is "M3 × 10 socket head, stainless" one item, separate from "M3 × 12"?
