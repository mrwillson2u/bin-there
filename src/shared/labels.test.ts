import { describe, expect, it } from "vitest";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  DEFAULT_STYLE,
  TEMPLATES,
  capacity,
  getTemplate,
  layoutPages,
  layoutSheet,
  pageSvg,
  printThenCut,
  randomCodes,
  slotsOf,
  textWidth,
  type RectShape,
  type TextShape,
} from "./labels";

// The sticker-sheet layout (DEC-052), ported from qr-label-creator: the templates' numbers, the
// Cricut re-grid, the codes, and that every label's drawing stays inside its label.

describe("templates", () => {
  it("carry the tuned measurements over exactly", () => {
    const sl855 = slotsOf(getTemplate("sl855"));
    expect(sl855).toHaveLength(80);
    expect(sl855[0]).toEqual({ x: 22.9968, y: 72.438, rotation: 0 });
    // Fills down the first column, then the next: the 17th label is the top of column 2.
    expect(sl855[16]).toEqual({ x: 22.9968 + 99 + 18, y: 72.438, rotation: 0 });
    expect(sl855[1]!.y).toBeCloseTo(72.438 + 40.5);
    expect(slotsOf(getTemplate("SL588"))).toHaveLength(76);
    expect(slotsOf(getTemplate("Avery6570"))).toHaveLength(32);
    const mr = slotsOf(getTemplate("MR183"));
    expect(mr).toHaveLength(30);
    expect(mr[0]).toEqual({ x: 20.41, y: 22.5358, rotation: 180 });
    expect(mr[1]!.x).toBeCloseTo(20.41 + 133.23);
    expect(mr[1]!.rotation).toBe(0);
    expect(() => getTemplate("nope")).toThrow("unknown template");
  });

  it("re-grids a label for Cricut Print Then Cut: as many as fit the 6.75 × 9.25 in area, the page just the labels", () => {
    const c = printThenCut(getTemplate("SL855"));
    expect([c.columns, c.rows]).toEqual([4, 13]);
    expect(c.pageSize[0]).toBeCloseTo(9 + 4 * 99 + 3 * 9);
    expect(c.pageSize[1]).toBeCloseTo(9 + 13 * 40.5 + 12 * 9);
    expect(c.pageSize[0]).toBeLessThanOrEqual(6.75 * 72);
    expect(c.pageSize[1]).toBeLessThanOrEqual(9.25 * 72);
    expect(slotsOf(c)).toHaveLength(52);
    expect(c.name).toBe("SL855-cricut");
    // The cable label is on landscape paper with fixed slots; re-gridded it's a plain grid again.
    expect(slotsOf(printThenCut(getTemplate("MR183"))).every((s) => s.rotation === 0)).toBe(true);
  });
});

describe("codes", () => {
  it("are 12 characters from the lookalike-free alphabet, all different", () => {
    const codes = randomCodes(500);
    expect(new Set(codes).size).toBe(500);
    for (const c of codes) {
      expect(c).toHaveLength(CODE_LENGTH);
      for (const ch of c) expect(CODE_ALPHABET).toContain(ch);
    }
    expect(CODE_ALPHABET).not.toMatch(/[0O1Il]/);
  });
});

describe("layout", () => {
  const inside = (t: ReturnType<typeof getTemplate>) => {
    const codes = randomCodes(slotsOf(t).length);
    const page = layoutSheet(t, codes, DEFAULT_STYLE, { outlines: true });
    const [w, h] = t.labelSize;
    const slots = slotsOf(t);
    // Every rectangle sits inside some label's box, and every line of text starts inside one (its
    // baseline point; the text runs in whichever direction the label is turned).
    for (const s of page.shapes) {
      const [sx, sy, sw, sh] = s.kind === "rect" ? [s.x, s.y, s.w, s.h] : [s.x, s.y, 0, 0];
      const fits = slots.some((slot) => sx >= slot.x - 0.5 && sy >= slot.y - 0.5 && sx + sw <= slot.x + w + 0.5 && sy + sh <= slot.y + h + 0.5);
      expect(fits, `${s.kind} at ${sx.toFixed(1)},${sy.toFixed(1)} on ${t.name}`).toBe(true);
    }
    return page;
  };

  it("keeps every label's drawing inside its label on every template, turned or not", () => {
    for (const t of TEMPLATES) inside(t);
    inside(printThenCut(getTemplate("SL855")));
  });

  it("draws the code as module runs and the words as three lines that fit the label", () => {
    const t = getTemplate("SL855");
    const page = layoutSheet(t, ["EddY9xhVRwAg"], { ...DEFAULT_STYLE, title: "Workshop", subtitle: "Inventory tag" });
    const rects = page.shapes.filter((s): s is RectShape => s.kind === "rect");
    const texts = page.shapes.filter((s): s is TextShape => s.kind === "text");
    expect(rects.length).toBeGreaterThan(30);
    expect(texts.map((x) => x.text)).toEqual(["Workshop", "Inventory tag", "EddY9xhVRwAg"]);
    expect(texts[0]!.bold).toBe(true);
    expect(texts[0]!.rotation).toBe(0);
    // The code's line is the long one, so it's shrunk to fit beside the QR.
    const [w] = t.labelSize;
    const qrSide = (t.labelSize[1] - 4) * 1;
    const textRoom = w - 4 - Math.min(qrSide, (w - 4) * 0.6);
    for (const x of texts) expect(x.size * textWidth(x.text, x.bold)).toBeLessThanOrEqual(textRoom + 0.01);
    // An empty subtitle is left out.
    expect(layoutSheet(t, ["x"], { ...DEFAULT_STYLE, subtitle: "" }).shapes.filter((s) => s.kind === "text")).toHaveLength(2);
  });

  it("turns the content on Avery 6570 and the flipped MR183 labels", () => {
    const avery = layoutSheet(getTemplate("Avery6570"), ["EddY9xhVRwAg"]);
    expect(avery.shapes.filter((s): s is TextShape => s.kind === "text").every((x) => x.rotation === -90 || x.rotation === 270)).toBe(true);
    const mr = layoutSheet(getTemplate("MR183"), ["EddY9xhVRwAg", "8WjAoohGcsr2"]);
    const texts = mr.shapes.filter((s): s is TextShape => s.kind === "text");
    // Two copies per label: six lines each; the first label is upside down, the second upright.
    expect(texts).toHaveLength(12);
    expect(texts.slice(0, 6).every((x) => Math.abs(x.rotation) === 180)).toBe(true);
    expect(texts.slice(6).every((x) => x.rotation === 0)).toBe(true);
  });

  it("spreads codes over pages, skips used slots on the first only, and refuses what won't fit", () => {
    const t = getTemplate("SL855");
    expect(capacity(t, 2, 10)).toBe(150);
    const pages = layoutPages(t, randomCodes(150), DEFAULT_STYLE, { skip: 10 });
    expect(pages).toHaveLength(2);
    expect(pages[0]!.shapes.filter((s) => s.kind === "text")).toHaveLength(70 * 3);
    expect(pages[1]!.shapes.filter((s) => s.kind === "text")).toHaveLength(80 * 3);
    expect(() => layoutSheet(t, randomCodes(81))).toThrow("won't fit");
    expect(() => layoutPages(t, [], DEFAULT_STYLE, { skip: 80 })).toThrow("skip must be");
    expect(layoutPages(t, [])).toHaveLength(1);
  });

  it("writes the page as SVG sized in inches, with white label backgrounds for the Cricut", () => {
    const c = printThenCut(getTemplate("SL855"));
    const svg = pageSvg(layoutSheet(c, ["EddY9xhVRwAg"], DEFAULT_STYLE, { background: true }));
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" version="1.1" width="6in" height="8.938in" viewBox="0 0 432 643.5">/);
    expect(svg).toContain('<rect x="4.5" y="4.5" width="99" height="40.5" rx="4.5" ry="4.5" fill="#ffffff"/>');
    expect(svg).toContain('font-weight="bold"');
    expect(svg).toContain(">EddY9xhVRwAg</text>");
    expect(pageSvg(layoutSheet(getTemplate("SL855"), ["a&b"], { ...DEFAULT_STYLE, title: "<Tools>" }))).toContain("&lt;Tools&gt;");
  });
});
