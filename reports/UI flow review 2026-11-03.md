# UI flow review, 2026-11-03

Every user story in `framework/03-UX-Framework.md` (J1 to J14) was walked through the real
app on a phone-sized screen by `scripts/ui-checks/stories-walk.mjs`. J10, labelling bins, needs a camera, so `stickers-check.mjs` covers it with a fake camera. The walk used a seeded
garage: a rack with two gridded boxes, a tote, a bench, nine parts, and one stickered power supply.
Each walk counted what the story costs, and the screenshots were checked by eye.

The yardstick is the UX framework's rule: the common updates take one or two actions, and
anything harder shows up only when the situation really is ambiguous. DEC-024 adds a second
one: every screen shows what's there before what you can do to it.

## What each story costs now

Counts are after the fixes below. A "tap" includes pressing Enter to submit.

| Story | Taps | Scans | Typed | Verdict |
|-------|------|-------|-------|---------|
| J1 Find a part, record taking 2 | 4 | 0 | 1 | Good. The search row shows the part, its count and its bin |
| J2 Put things back | 2 | 3 | 0 | Good. A one-part bin takes one scan; a mixed bin asks which part |
| J3 Move a part to another bin (from the list) | 3 | 0 | 0 | Good after the fix (was 6) |
| J3 Move a bin to another box | 1 | 3 | 0 | Works. The bin waits in the new box's "not placed" tray until arranged |
| J4 Start a project kit, pull a part in | 5 | 0 | 2 | Fine |
| J5 Browse to a box, look in a bin | 3 | 0 | 0 | Good. Small 1×1 tiles cut long names short |
| J6 Add a new part with a photo, into a bin | 3 | 1 | 1 | Good. The bin stays set for the next part |
| J7 Scan stickers to open things | 0 | 1 each | 0 | Good. An unused sticker asks what it's for |
| J8 Lend a stickered part out, check it back in | 5 | 1 | 1 | Fine |
| J9 Fill an empty bin from the grid | 3 | 0 | 2 | Good: name, count, Enter, then tap the photo spot |
| J10 Label bins (Stickers screen) | 2 per bin | 0 | 0 | Good. Brackets, beep and buzz, move and undo for mix-ups |
| J11 Undo a wrong tap | 2 | 0 | 0 | Good |
| J11 Part put in the wrong bin, fixed from the box | 3 | 1 | 0 | Works, but leaves the box view (see proposal 3) |
| J12 See what's running low | 1 | 0 | 0 | Fine as a shopping list. Marking a part restocked means opening it |
| J13 Check counts that may be off | 2 | 0 | 0 | Good. "Still 100" is one tap |
| J14 Fill in details for quick-added parts | 4 per part | 0 | some | Weak. Nearly everything is on the list, and there's no "next" (proposals 1 and 2) |

## Fixed in this pass

- **Scanning in the bin pane no longer writes silently.** Before, scanning an unused sticker with the
  hardware scanner put it on the open bin, with nothing on screen saying it would. Now the pane
  asks "New sticker scanned. Is it the sticker for Bin 0001?", with **Put it on Bin 0001**,
  **It's for something else** and **Not now**. Every other screen that takes scans already said what a scan does there.
- **Paths keep the place you're after.** One-line paths were cut at the end, so the search row showed
  "Garage › Rack A › Grid box 1 …" and lost the bin. Now the outer places shorten first, and with
  only one site its name is left off: "Rack A › Grid box 1 › Bin 0001". This covers search,
  running low, pinned, put-back, project kits, checked out, and stickered units.
- **Picking a place from the list starts beside the part.** It opens in the part's own box, marks its
  current bin "here now", and says what's in each bin or "Empty". Moving a part dropped from 6 taps to 3.
- **Saving details goes back where you came from.** Before, Back after saving showed the same part again.
- **Small things.** The new-bin form said "Leave blank for Bin 1, Bin 2", now "like Bin 0042".
  Checked-out rows show where the part lives with a house icon instead of its sticker code.

## Proposed next, most useful first

1. **Decide what "needs details" means (question for Colin).** A part only skips the list if it has
   a name and a category, and nothing in the bin pane sets a category. So in the walk, all 9 parts
   were on the list. The yellow badge sits on every row, cutting names short ("Electrical t…").
   One option: a part with a name counts as done, and only photo-only parts need details.
   Another: keep the rule, but drop the badge from lists.
2. **"Save and next" when working through the list.** Today each part costs a tap into the part,
   a tap on "Needs details", the form, Save, and Back. A button that saves and opens the next
   part would make J14 a couch job.
3. **Move a part from the bin pane.** Putting a part in the wrong bin is the likeliest slip while
   filling a box. Today the fix means opening the part's page. A Move in the pane would let you
   pick the right bin on the grid or scan it, without leaving the box.
4. **An unused sticker for something that already exists.** The "New sticker" page tells you to go
   open the thing and use Assign sticker. It could offer "Put it on…" right there, by scan or from the list.
5. **Names on small tiles.** A 1×1 tile on a phone fits about 8 letters ("M3 x 10…"). A thumbnail
   of the part's photo on the tile, when there is one, might identify it faster than the clipped name.
6. **Restock from the low list.** After buying, setting a part back to Plenty means opening it.
   A one-tap "Restocked" on the list would close the loop.
7. **Small consistency items.** The part page uses a "Take photo" button where the bin pane uses
   the photo spot. The arrow-only Move button on a stickered unit doesn't say what it does.

## How to rerun

See `scripts/ui-checks/README.md`. Run the story walk after any UI change and compare the counts with the table above.
