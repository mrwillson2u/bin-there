// Field names (DEC-071), shared by the server (which enforces them) and the screens (which hint).

/** The naming convention: spaces tidied, first letter a capital, the rest as typed ("ID" stays "ID"). */
export const fieldName = (s: string) => {
  const t = s.trim().replace(/\s+/g, " ");
  return t ? t[0]!.toUpperCase() + t.slice(1) : t;
};

/** A name with only its letters and digits, lower case: "O.D.", "od" and "OD " are one name. */
export const bare = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

type Def = { key: string; label: string; type: string; options?: string[]; perUnit?: boolean };

/** One value that can't stay where it is when a part changes category (DEC-072). */
export type Leaving = {
  key: string;
  label: string;
  value: string;
  /** A stickered unit's own value (DEC-062), not the part's. */
  unitId?: number;
  unitCode?: string;
  /** The new category's field of the same name, when the value fits it: kept, it goes there. */
  into?: string;
};

/**
 * What a part holds in its category's fields that the new category doesn't have (DEC-072): every
 * field belongs to one category, so these either go (deleted) or are kept. Kept, a value goes into
 * the new category's field of the same name when there is one it fits (a choice field only takes
 * one of its options), else it becomes a custom field of the part. The server and the dialog both
 * work from this list.
 */
export function leavingValues(
  oldDefs: Def[],
  newDefs: Def[],
  attributes: Record<string, string | number>,
  units: { id: number; code: string | null; attributes?: Record<string, string> | null }[],
): Leaving[] {
  const stays = new Set(newDefs.map((d) => d.key));
  const target = (d: Def, value: string) => {
    const t = newDefs.find((n) => bare(n.label) === bare(d.label) && !!n.perUnit === !!d.perUnit);
    return t && (t.type !== "choice" || (t.options ?? []).includes(value)) ? t.key : undefined;
  };
  const out: Leaving[] = [];
  for (const d of oldDefs) {
    if (stays.has(d.key)) continue;
    if (d.perUnit) {
      for (const u of units) {
        const value = String(u.attributes?.[d.key] ?? "").trim();
        if (!value) continue;
        const into = target(d, value);
        out.push({ key: d.key, label: d.label, value, unitId: u.id, unitCode: u.code ?? `unit ${u.id}`, ...(into && !String(u.attributes?.[into] ?? "").trim() ? { into } : {}) });
      }
    } else {
      const value = String(attributes[d.key] ?? "").trim();
      if (!value) continue;
      const into = target(d, value);
      out.push({ key: d.key, label: d.label, value, ...(into && !String(attributes[into] ?? "").trim() ? { into } : {}) });
    }
  }
  return out;
}

/** The custom field a kept value becomes: its field's name, with the old category's when that name is taken. */
export function keptName(l: Leaving, oldCategory: string, taken: (name: string) => boolean): string {
  const name = l.unitCode ? `${l.label} (${l.unitCode})` : l.label;
  return taken(name) ? `${name} (${oldCategory})` : name;
}
