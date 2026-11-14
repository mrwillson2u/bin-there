// The 2D barcode on a shop's bag (DEC-074). Distributors print one that carries the order line as
// text: Digi-Key and Mouser a Data Matrix in the industry's labelled-field format (ISO 15434 /
// ANSI MH10.8.2: "[)>", then fields split by the GS character, each starting with an identifier
// such as 1P for the maker's part number or Q for the quantity), LCSC a QR code of
// "{pc:C2040,pm:RP2040,qty:1,...}". Reading it gives the part number exactly, with no AI and no
// guessing from a photo of small print.

export type BagCode = {
  /** The shop, when the code says which ("Digi-Key", "LCSC"); null when it doesn't. */
  supplier: string | null;
  /** The shop's own part number (Digi-Key's "296-6501-1-ND", LCSC's "C2040"). */
  supplierPn: string | null;
  /** The maker's part number. */
  mfrPn: string | null;
  /** How many were in the bag when it shipped. */
  qty: number | null;
};

const GS = "\u001d";
const RS = "\u001e";
const EOT = "\u0004";

/** The number to keep on the part: the shop's own when there is one, else the maker's. */
export const bagPartNumber = (b: BagCode) => b.supplierPn ?? b.mfrPn;

/** One line to show for a bag that was read. */
export const bagText = (b: BagCode) => [b.supplier, bagPartNumber(b), b.supplierPn && b.mfrPn ? `(${b.mfrPn})` : null].filter(Boolean).join(" ");

const count = (s: string | undefined) => {
  const n = Number(s);
  return s && /^\d{1,7}$/.test(s.trim()) && n > 0 ? n : null;
};
const clean = (s: string | undefined) => {
  const t = (s ?? "").trim();
  return t && t.length <= 60 && !/\s{2,}/.test(t) ? t : null;
};

/** What a decoded 2D barcode says about the part, or null when it isn't a shop's bag code. */
export function parseBagCode(text: string): BagCode | null {
  // Some decoders hand back control characters as their printable pictures ("␝" for GS); same thing.
  const t = text.replace(/[\u2400-\u241f]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x2400)).trim();
  // LCSC: {pbn:...,on:...,pc:C2040,pm:RP2040,qty:1,...}
  if (/^\{.*\bpc:/.test(t)) {
    const fields = new Map(t.replace(/^\{|\}$/g, "").split(",").map((f) => [f.slice(0, f.indexOf(":")).trim(), f.slice(f.indexOf(":") + 1)] as [string, string]));
    const supplierPn = clean(fields.get("pc"));
    const mfrPn = clean(fields.get("pm"));
    if (!supplierPn && !mfrPn) return null;
    return { supplier: "LCSC", supplierPn, mfrPn, qty: count(fields.get("qty")) };
  }
  // Labelled fields: "[)>" RS "06" GS field GS field ... RS EOT
  if (!t.includes("[)>") || !t.includes(GS)) return null;
  const fields = new Map<string, string>();
  for (const raw of t.slice(t.indexOf("[)>") + 3).split(new RegExp(`[${GS}${RS}${EOT}]`))) {
    const m = /^(\d{0,2}[A-Z])(.*)$/.exec(raw.trim());
    if (m && !fields.has(m[1]!)) fields.set(m[1]!, m[2]!);
  }
  const mfrPn = clean(fields.get("1P"));
  // Digi-Key's own number is 30P on newer bags and P on older ones (it ends in -ND).
  const dk = clean(fields.get("30P")) ?? (/-ND$/i.test(fields.get("P") ?? "") ? clean(fields.get("P")) : null);
  if (!mfrPn && !dk) return null;
  return { supplier: dk ? "Digi-Key" : null, supplierPn: dk, mfrPn, qty: count(fields.get("Q")) };
}
