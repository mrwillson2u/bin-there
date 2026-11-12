/**
 * The name after this one when adding places in a run (DEC-058): the number at the end goes up
 * one, keeping its padding ("Shelf 03" → "Shelf 04", "Tote A1" → "Tote A2"); a name with no
 * number at the end gets " 2".
 */
export function nextName(name: string): string {
  const m = /^(.*?)(\d+)(\s*)$/.exec(name);
  if (!m) return `${name.trimEnd()} 2`;
  const [, head, digits] = m;
  const next = String(Number(digits) + 1).padStart(digits!.length, "0");
  return `${head}${next}`;
}
