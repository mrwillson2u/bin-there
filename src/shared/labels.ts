// Sticker sheets (DEC-052): the label templates and the page layout, ported from Colin's
// qr-label-creator (github.com/mrwillson2u/qr-label-creator). The measurements were tuned on
// real prints there, not taken from the makers' spec sheets, so they're kept to the point.
//
// Every length is a PostScript point (72 to the inch), the unit the SVG viewBox and the PDF both
// use. A page is laid out into plain rectangles and text in page coordinates, so the same layout
// draws as SVG (the preview, and the PNG for the Cricut) and as PDF (die-cut sheets) with no
// transforms left for the drawing side to get wrong.

import { create as createQr } from "qrcode";

export const PT_PER_INCH = 72;
export const LETTER: [number, number] = [612, 792];
export const LETTER_LANDSCAPE: [number, number] = [792, 612];

/**
 * Cricut's Print Then Cut area for a Maker on Letter paper (help.cricut.com, "How large can I
 * Print Then Cut", 2026): 7.44 in across, 9.94 in tall, with the corners reserved for the sensor
 * marks. The notch isn't given, but Colin measured the plain rectangle inside the marks at
 * 6.77 × 9.27 in, which leaves 0.335 in at each side, top and bottom. Both are settings on the screen.
 */
export const PRINT_THEN_CUT_AREA: [number, number] = [7.44 * PT_PER_INCH, 9.94 * PT_PER_INCH];
export const PRINT_THEN_CUT_NOTCH: [number, number] = [0.335 * PT_PER_INCH, 0.335 * PT_PER_INCH];

export type CutOptions = {
  /** The whole Print Then Cut area; the image is this size, so it sits exactly over it. */
  area?: [number, number];
  /** The corner each sensor mark takes; a label touching one is left out. */
  notch?: [number, number];
  /** The most space between labels; the least is half this, so one more column or row can fit. */
  gap?: number;
};

/** The top-left corner of one label on the page; rotation 180 turns the whole label. */
export type Slot = { x: number; y: number; rotation: 0 | 180 };

export type LabelTemplate = {
  name: string;
  description: string;
  /** The label's width and height. */
  labelSize: [number, number];
  columns: number;
  rows: number;
  /** Top-left corner of the first label. */
  origin: [number, number];
  /** Space between columns, between rows. */
  gap: [number, number];
  pageSize: [number, number];
  cornerRadius: number;
  /** "side": the code left of the text. "stacked": the code above the text. */
  layout: "side" | "stacked";
  /** Turn the content within the label, in 90° steps. */
  rotation: 0 | 90 | 180 | 270;
  /** Repeat the content stacked vertically, e.g. both ends of a cable flag. */
  copies: number;
  /** "columns": fill down each column first. "rows": across. */
  fillOrder: "columns" | "rows";
  url: string | null;
  /** For sheets that aren't a plain grid. */
  fixedSlots: Slot[] | null;
};

const base: Omit<LabelTemplate, "name" | "description" | "labelSize" | "columns" | "rows"> = {
  origin: [0, 0],
  gap: [0, 0],
  pageSize: LETTER,
  cornerRadius: 0,
  layout: "side",
  rotation: 0,
  copies: 1,
  fillOrder: "columns",
  url: null,
  fixedSlots: null,
};

function mr183Slots(): Slot[] {
  // Staggered pairs of columns, alternate labels flipped; positions carried over from the
  // original qr-generator-MR183.py.
  const slots: Slot[] = [];
  for (let i = 0; i < 30; i++) {
    const x = 20.41 + (i % 2) * 133.23 + Math.floor(i / 10) * 256.5351;
    const y = 22.5358 + ((i % 10) / 2) * 113.3851 - (i % 2) * 17.0075;
    slots.push({ x, y, rotation: i % 2 === 0 ? 180 : 0 });
  }
  return slots;
}

export const TEMPLATES: LabelTemplate[] = [
  // The script called this sheet "SL855"; SheetLabels' SL588 page (1.375" × 0.5625", 80 up, rounded,
  // 1" top and 0.3125" left margins, 0.25" between columns) is this one, and it's the size Colin
  // cuts on his vinyl too. The tuned origin is kept (half a point off the maker's figure).
  {
    ...base,
    name: "SL588",
    description: 'SheetLabels.com SL588, 1.375" × 0.5625", 80 per sheet',
    labelSize: [99, 40.5],
    columns: 5,
    rows: 16,
    origin: [22.9968, 72.438],
    gap: [18, 0],
    cornerRadius: 4.5,
    url: "https://www.sheetlabels.com/labels/SL588",
  },
  {
    ...base,
    name: "Avery6570",
    description: 'Avery 6570 permanent ID labels, 1.75" × 1.25"',
    labelSize: [126, 90],
    columns: 4,
    rows: 8,
    origin: [33.6806, 36],
    gap: [13.5463, 0],
    layout: "stacked",
    rotation: 270,
    url: "https://www.avery.com/templates/6570",
  },
  {
    ...base,
    name: "MR183",
    description: "MR183 cable labels, landscape, the code printed twice per label",
    labelSize: [104.881, 73.7],
    columns: 6,
    rows: 5,
    pageSize: LETTER_LANDSCAPE,
    copies: 2,
    fixedSlots: mr183Slots(),
  },
];

export function getTemplate(name: string): LabelTemplate {
  const t = TEMPLATES.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!t) throw new Error(`unknown template ${name}`);
  return t;
}

export function slotsOf(t: LabelTemplate): Slot[] {
  if (t.fixedSlots) return t.fixedSlots;
  const [w, h] = t.labelSize;
  const cells: [number, number][] = [];
  if (t.fillOrder === "rows") {
    for (let r = 0; r < t.rows; r++) for (let c = 0; c < t.columns; c++) cells.push([c, r]);
  } else {
    for (let c = 0; c < t.columns; c++) for (let r = 0; r < t.rows; r++) cells.push([c, r]);
  }
  return cells.map(([c, r]) => ({ x: t.origin[0] + c * (w + t.gap[0]), y: t.origin[1] + r * (h + t.gap[1]), rotation: 0 }));
}

/**
 * The template's label laid out on blank sticker paper for Cricut Print Then Cut: as many as fit
 * in the cut area with a gap between them (Design Space sees touching labels as one shape). The
 * page shrinks to just the labels, so the exported image is the whole cut area.
 */
export function printThenCut(t: LabelTemplate, opts: CutOptions = {}): LabelTemplate {
  const area = opts.area ?? PRINT_THEN_CUT_AREA;
  const notch = opts.notch ?? PRINT_THEN_CUT_NOTCH;
  const most = opts.gap ?? 9;
  const least = most / 2;
  const [w, h] = t.labelSize;
  // As many as fit with at least the smallest gap (and that much at the edges), then the gap
  // spread evenly up to the largest, and the grid centred in the area.
  const fit = (across: number, size: number) => {
    const n = Math.floor((across - least) / (size + least));
    const gap = Math.min(most, (across - n * size) / (n + 1));
    const start = (across - n * size - (n - 1) * gap) / 2;
    return { n, gap, start };
  };
  const x = fit(area[0], w);
  const y = fit(area[1], h);
  if (x.n < 1 || y.n < 1) throw new Error(`a ${w} × ${h} pt label doesn't fit the Print Then Cut area`);
  const touchesNotch = (sx: number, sy: number) => {
    const left = sx < notch[0];
    const right = sx + w > area[0] - notch[0];
    const top = sy < notch[1];
    const bottom = sy + h > area[1] - notch[1];
    return (left || right) && (top || bottom);
  };
  const slots: Slot[] = [];
  for (let c = 0; c < x.n; c++) {
    for (let r = 0; r < y.n; r++) {
      const sx = x.start + c * (w + x.gap);
      const sy = y.start + r * (h + y.gap);
      if (!touchesNotch(sx, sy)) slots.push({ x: sx, y: sy, rotation: 0 });
    }
  }
  return {
    ...t,
    name: `${t.name}-cricut`,
    description: `${t.description}, Cricut Print Then Cut`,
    columns: x.n,
    rows: y.n,
    origin: [x.start, y.start],
    gap: [x.gap, y.gap],
    pageSize: [area[0], area[1]],
    fixedSlots: slots,
  };
}

// ── Codes ──

/** shortuuid's alphabet: no 0/O, 1/I/l or other lookalikes. The same format as every sticker printed so far. */
export const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export const CODE_LENGTH = 12;

/** Random codes, all different, from the browser's or Node's secure random source. */
export function randomCodes(count: number, random: (n: number) => Uint8Array = defaultRandom): string[] {
  const out = new Set<string>();
  while (out.size < count) {
    const bytes = random(CODE_LENGTH * 2);
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[((bytes[2 * i]! << 8) | bytes[2 * i + 1]!) % CODE_ALPHABET.length];
    out.add(code);
  }
  return [...out];
}

function defaultRandom(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

// ── Layout ──

export type LabelStyle = {
  title: string;
  subtitle: string;
  titleColor: string;
  subtitleColor: string;
  codeColor: string;
  /** Blank modules around the code. */
  quietZone: number;
  /** Points between the label edge and its content. */
  padding: number;
};

export const DEFAULT_STYLE: LabelStyle = {
  title: "Inventory",
  subtitle: "Bin There",
  titleColor: "#336699",
  subtitleColor: "#000000",
  codeColor: "#000000",
  quietZone: 2,
  padding: 2,
};

/** A filled rectangle (a QR module run, a label background) or an outline. */
export type RectShape = { kind: "rect"; x: number; y: number; w: number; h: number; rx: number; fill: string | null; stroke: string | null };
/** Text at a baseline point, turned `rotation` degrees clockwise about that point. */
export type TextShape = { kind: "text"; x: number; y: number; size: number; text: string; bold: boolean; color: string; anchor: "start" | "middle"; rotation: number };
export type Shape = RectShape | TextShape;

export type Page = { width: number; height: number; shapes: Shape[] };

/** An affine map: x' = a·x + c·y + e, y' = b·x + d·y + f (the SVG convention). */
type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];
const rotate = (deg: number): Matrix => {
  const r = (deg * Math.PI) / 180;
  const c = Math.round(Math.cos(r) * 1e9) / 1e9;
  const s = Math.round(Math.sin(r) * 1e9) / 1e9;
  return [c, s, -s, c, 0, 0];
};
const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const angleOf = (m: Matrix) => Math.round((Math.atan2(m[1], m[0]) * 180) / Math.PI);

/** The turn that fills a w × h box with content drawn in the returned box. */
function turn(degrees: number, w: number, h: number): { m: Matrix; w: number; h: number } {
  switch (((degrees % 360) + 360) % 360) {
    case 0:
      return { m: IDENTITY, w, h };
    case 90:
      return { m: mul(translate(w, 0), rotate(90)), w: h, h: w };
    case 180:
      return { m: mul(translate(w, h), rotate(180)), w, h };
    case 270:
      return { m: mul(translate(0, h), rotate(270)), w: h, h: w };
    default:
      throw new Error(`rotation must be a multiple of 90, got ${degrees}`);
  }
}

// Approximate Helvetica/Arial glyph widths as a fraction of the font size, slightly generous.
// Only used to shrink lines that would run off the label.
const CHAR_WIDTH = {
  normal: { wide: 0.89, narrow: 0.3, upper: 0.7, lower: 0.54, digit: 0.56, space: 0.28, other: 0.58 },
  bold: { wide: 0.92, narrow: 0.34, upper: 0.74, lower: 0.6, digit: 0.56, space: 0.28, other: 0.62 },
};
const WIDE = new Set("mwMW@");
const NARROW = new Set("fijlrtI.,:;!|'");
const LEADING = 1.25;

function charKind(c: string): keyof typeof CHAR_WIDTH.normal {
  if (WIDE.has(c)) return "wide";
  if (NARROW.has(c)) return "narrow";
  if (c >= "A" && c <= "Z") return "upper";
  if (c >= "a" && c <= "z") return "lower";
  if (c >= "0" && c <= "9") return "digit";
  return c === " " ? "space" : "other";
}

/** Estimated width of text at font size 1, with 6% to spare. */
export function textWidth(text: string, bold: boolean): number {
  const table = CHAR_WIDTH[bold ? "bold" : "normal"];
  let sum = 0;
  for (const c of text) sum += table[charKind(c)];
  return 1.06 * sum;
}

/** A rectangle in local coordinates mapped through m; the turns are right angles, so it stays a rectangle. */
function rectThrough(m: Matrix, x: number, y: number, w: number, h: number, rx: number, fill: string | null, stroke: string | null): RectShape {
  const [x1, y1] = apply(m, x, y);
  const [x2, y2] = apply(m, x + w, y + h);
  return { kind: "rect", x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), rx, fill, stroke };
}

function qrShapes(m: Matrix, data: string, x: number, y: number, size: number, style: LabelStyle): RectShape[] {
  const code = createQr(data, { errorCorrectionLevel: "M" });
  const n = code.modules.size;
  const scale = size / (n + 2 * style.quietZone);
  const offset = style.quietZone * scale;
  const shapes: RectShape[] = [];
  // Horizontal runs of dark modules, so a code is a few dozen rectangles rather than hundreds.
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!code.modules.get(r, c)) {
        c++;
        continue;
      }
      const start = c;
      while (c < n && code.modules.get(r, c)) c++;
      shapes.push(rectThrough(m, x + offset + start * scale, y + offset + r * scale, (c - start) * scale, scale, 0, "#000000", null));
    }
  }
  return shapes;
}

/** A line of text; `measure` is a fixed width at size 1 to size it by instead of its own letters. */
type Line = [text: string, bold: boolean, color: string, measure?: number];

/**
 * Every code is sized as if its letters were a little wider than average, so a code of narrow
 * letters isn't printed bigger than its neighbours; one of unusually wide letters still shrinks to fit.
 */
const CODE_MEASURE = 1.06 * 0.66 * CODE_LENGTH;

/** Lines stacked and vertically centred in the box, each shrunk if it would overflow the width. */
function textShapes(m: Matrix, lines: Line[], box: [number, number, number, number], anchor: "start" | "middle"): TextShape[] {
  const [x, y, w, h] = box;
  const kept = lines.filter((l) => l[0]);
  if (kept.length === 0 || w <= 0 || h <= 0) return [];
  const base = h / (LEADING * kept.length);
  const sizes = kept.map(([text, bold, , measure]) => Math.min(base, w / Math.max(measure ?? 0, textWidth(text, bold))));
  let lineBottom = y + (h - LEADING * sizes.reduce((a, b) => a + b, 0)) / 2;
  const textX = anchor === "middle" ? x + w / 2 : x;
  const rotation = angleOf(m);
  return kept.map(([text, bold, color], i) => {
    const size = sizes[i]!;
    lineBottom += LEADING * size;
    // The baseline that centres capitals in the line.
    const [px, py] = apply(m, textX, lineBottom - 0.27 * size);
    return { kind: "text", x: px, y: py, size, text, bold, color, anchor, rotation };
  });
}

function contentShapes(m: Matrix, w: number, h: number, code: string, style: LabelStyle, layout: LabelTemplate["layout"]): Shape[] {
  const p = style.padding;
  const lines: Line[] = [
    [style.title, true, style.titleColor],
    [style.subtitle, false, style.subtitleColor],
    [code, false, style.codeColor, code.length === CODE_LENGTH ? CODE_MEASURE : undefined],
  ];
  if (layout === "stacked") {
    const size = Math.min(w - 2 * p, (h - 2 * p) * 0.68);
    return [...qrShapes(m, code, (w - size) / 2, p, size, style), ...textShapes(m, lines, [p, p + size, w - 2 * p, h - 2 * p - size], "middle")];
  }
  const size = Math.min(h - 2 * p, (w - 2 * p) * 0.6);
  return [...qrShapes(m, code, p, (h - size) / 2, size, style), ...textShapes(m, lines, [p + size, p, w - 2 * p - size, h - 2 * p], "start")];
}

function labelShapes(t: LabelTemplate, slot: Slot, code: string, style: LabelStyle, background: boolean, outline: boolean): Shape[] {
  const [w, h] = t.labelSize;
  let m = translate(slot.x, slot.y);
  if (slot.rotation) m = mul(m, turn(slot.rotation, w, h).m);
  const shapes: Shape[] = [];
  if (background || outline) shapes.push(rectThrough(m, 0, 0, w, h, t.cornerRadius, background ? "#ffffff" : null, outline ? "#999999" : null));
  const strip = h / t.copies;
  for (let copy = 0; copy < t.copies; copy++) {
    const inner = turn(t.rotation, w, strip);
    const cm = mul(mul(m, translate(0, copy * strip)), inner.m);
    shapes.push(...contentShapes(cm, inner.w, inner.h, code, style, t.layout));
  }
  return shapes;
}

export type SheetOptions = {
  /** Leave the first slots empty, for a partly used sheet. */
  skip?: number;
  /** Fill each label white: what the Cricut cuts around. */
  background?: boolean;
  /** Draw the label edges, for a test print on plain paper. */
  outlines?: boolean;
};

/** One page: the labels for these codes in the template's slots. */
export function layoutSheet(t: LabelTemplate, codes: string[], style: LabelStyle = DEFAULT_STYLE, opts: SheetOptions = {}): Page {
  const slots = slotsOf(t).slice(opts.skip ?? 0);
  if (codes.length > slots.length) throw new Error(`${codes.length} labels won't fit in ${slots.length} free slots on ${t.name}`);
  const shapes: Shape[] = [];
  codes.forEach((code, i) => shapes.push(...labelShapes(t, slots[i]!, code, style, !!opts.background, !!opts.outlines)));
  return { width: t.pageSize[0], height: t.pageSize[1], shapes };
}

/** As many pages as the codes need; `skip` applies to the first page only. At least one page. */
export function layoutPages(t: LabelTemplate, codes: string[], style: LabelStyle = DEFAULT_STYLE, opts: SheetOptions = {}): Page[] {
  const perPage = slotsOf(t).length;
  const skip = opts.skip ?? 0;
  if (skip < 0 || skip >= perPage) throw new Error(`skip must be between 0 and ${perPage - 1}`);
  const pages: Page[] = [];
  let remaining = codes;
  while (remaining.length > 0 || pages.length === 0) {
    const offset = pages.length === 0 ? skip : 0;
    const take = perPage - offset;
    pages.push(layoutSheet(t, remaining.slice(0, take), style, { ...opts, skip: offset }));
    remaining = remaining.slice(take);
  }
  return pages;
}

/** How many labels `pages` sheets hold, less the skipped slots on the first. */
export function capacity(t: LabelTemplate, pages: number, skip = 0): number {
  return Math.max(0, slotsOf(t).length * pages - skip);
}

const num = (v: number) => (Math.round(v * 1000) / 1000).toString();

/** The page as an SVG document, sized in inches so a browser prints it at scale. */
export function pageSvg(page: Page, fontFamily = "Helvetica, Arial, sans-serif"): string {
  const parts: string[] = [];
  for (const s of page.shapes) {
    if (s.kind === "rect") {
      const attrs = [`x="${num(s.x)}"`, `y="${num(s.y)}"`, `width="${num(s.w)}"`, `height="${num(s.h)}"`];
      if (s.rx) attrs.push(`rx="${num(s.rx)}"`, `ry="${num(s.rx)}"`);
      attrs.push(`fill="${s.fill ?? "none"}"`);
      if (s.stroke) attrs.push(`stroke="${s.stroke}"`, `stroke-width="0.25"`);
      parts.push(`<rect ${attrs.join(" ")}/>`);
    } else {
      const attrs = [`x="${num(s.x)}"`, `y="${num(s.y)}"`, `font-family="${fontFamily}"`, `font-size="${num(s.size)}"`, `fill="${s.color}"`];
      if (s.bold) attrs.push(`font-weight="bold"`);
      if (s.anchor === "middle") attrs.push(`text-anchor="middle"`);
      if (s.rotation) attrs.push(`transform="rotate(${s.rotation} ${num(s.x)} ${num(s.y)})"`);
      parts.push(`<text ${attrs.join(" ")}>${escapeXml(s.text)}</text>`);
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${num(page.width / PT_PER_INCH)}in" height="${num(page.height / PT_PER_INCH)}in" viewBox="0 0 ${num(page.width)} ${num(page.height)}">` +
    parts.join("") +
    `</svg>`
  );
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
}
