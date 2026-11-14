import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./db/schema";
import { categories, fields, items, units, type FieldDef } from "./db/schema";
import { bare, fieldName } from "../shared/fields";

// Fields (DEC-071, DEC-072). Every category field is one row in `fields` with its own ID; its key
// everywhere else ("f12" in a category's template, a part's values, a unit's values, the AI
// marks) is that ID, never its name. A field belongs to exactly one category. A part can also
// have custom fields of its own: `items.custom`, by name, a separate store. When a part changes
// category, what it held in the old category's fields is kept or deleted (`updateItem`).

type Db = BetterSQLite3Database<typeof schema>;

export { bare, fieldName };

export const keyOf = (id: number) => `f${id}`;
export const isFieldKey = (key: string) => /^f\d+$/.test(key);
const idOf = (key: string) => (isFieldKey(key) ? Number(key.slice(1)) : -1);

export function fieldRow(db: Db, key: string) {
  return db.select().from(fields).where(eq(fields.id, idOf(key))).get();
}

/** A new category-only field; its key. */
export function createField(db: Db, name: string, categoryId: number | null): string {
  return keyOf(db.insert(fields).values({ name, categoryId }).returning({ id: fields.id }).get().id);
}

/** Change a field's entry in every category's template that has it. */
function rewriteEverywhere(db: Db, key: string, change: (d: FieldDef) => FieldDef) {
  for (const c of db.select({ id: categories.id, fieldDefs: categories.fieldDefs }).from(categories).all()) {
    if (!c.fieldDefs.some((d) => d.key === key)) continue;
    db.update(categories).set({ fieldDefs: c.fieldDefs.map((d) => (d.key === key ? change(d) : d)) }).where(eq(categories.id, c.id)).run();
  }
}

/** One field, one name: a rename shows in every category that uses it. */
export function renameField(db: Db, key: string, name: string) {
  db.update(fields).set({ name }).where(eq(fields.id, idOf(key))).run();
  rewriteEverywhere(db, key, (d) => ({ ...d, label: name }));
}

const rekeyMap = <V>(map: Record<string, V>, from: string, to: string): Record<string, V> | null => {
  if (!(from in map)) return null;
  const { [from]: moved, ...rest } = map;
  return { ...rest, [to]: moved! };
};

/**
 * Bring a database to "a field belongs to one category" (DEC-072), once. A field several
 * categories shared (DEC-071's universal fields) stays with the first and becomes a field of its
 * own in each of the others, their parts' values re-keyed. A value a part holds under another
 * category's field, left behind by an earlier category change, becomes one of its custom fields.
 * Values under a field its own category dropped are left alone (they come back with the field).
 * Safe to run again. Returns the parts changed, for re-indexing.
 */
export function settleFields(db: Db): number[] {
  const changed = new Set<number>();
  db.transaction((tx) => {
    const cats = tx.select().from(categories).all();
    const owner = new Map<string, number>();
    for (const c of cats) {
      let touched = false;
      const next: FieldDef[] = [];
      for (const d of c.fieldDefs) {
        const { universal, ...def } = d as FieldDef & { universal?: boolean };
        if (universal !== undefined) touched = true;
        if (!owner.has(def.key)) {
          owner.set(def.key, c.id);
          next.push(def);
          continue;
        }
        const key = keyOf(tx.insert(fields).values({ name: def.label, categoryId: c.id }).returning({ id: fields.id }).get().id);
        owner.set(key, c.id);
        touched = true;
        next.push({ ...def, key });
        for (const i of tx.select().from(items).where(eq(items.categoryId, c.id)).all()) {
          const attributes = rekeyMap(i.attributes, def.key, key);
          const aiFields = rekeyMap(i.aiFields ?? {}, `attributes.${def.key}`, `attributes.${key}`);
          const hit = i.aiResult?.suggestions.some((s) => s.field === `attributes.${def.key}`);
          if (attributes || aiFields || hit) {
            tx.update(items)
              .set({
                ...(attributes ? { attributes } : {}),
                ...(aiFields ? { aiFields } : {}),
                ...(hit ? { aiResult: { ...i.aiResult!, suggestions: i.aiResult!.suggestions.map((s) => (s.field === `attributes.${def.key}` ? { ...s, field: `attributes.${key}` } : s)) } } : {}),
              })
              .where(eq(items.id, i.id))
              .run();
            changed.add(i.id);
          }
          for (const u of tx.select({ id: units.id, attributes: units.attributes }).from(units).where(eq(units.itemId, i.id)).all()) {
            const own = rekeyMap(u.attributes ?? {}, def.key, key);
            if (own) tx.update(units).set({ attributes: own }).where(eq(units.id, u.id)).run();
          }
        }
      }
      if (touched) {
        tx.update(categories).set({ fieldDefs: next }).where(eq(categories.id, c.id)).run();
        c.fieldDefs = next;
      }
    }
    const rows = new Map(tx.select().from(fields).all().map((f) => [keyOf(f.id), f]));
    for (const [key, row] of rows) {
      const cat = owner.get(key);
      if (cat !== undefined && row.categoryId !== cat) {
        tx.update(fields).set({ categoryId: cat }).where(eq(fields.id, row.id)).run();
        row.categoryId = cat;
      }
    }
    const catName = new Map(cats.map((c) => [c.id, c.name]));
    const template = new Map(cats.map((c) => [c.id, c.fieldDefs]));
    // Whose field a stored key is: a value under another category's field is a leftover.
    const foreign = (key: string, categoryId: number | null) => rows.get(key)?.categoryId !== categoryId || categoryId === null;
    for (const i of tx.select().from(items).all()) {
      const defs = i.categoryId ? (template.get(i.categoryId) ?? []) : [];
      const mine = new Set(defs.map((d) => d.key));
      const custom = { ...(i.custom ?? {}) };
      const taken = (name: string) => name in custom || defs.some((d) => bare(d.label) === bare(name));
      const place = (key: string, value: string, suffix: string) => {
        const row = rows.get(key);
        const from = row?.categoryId ? catName.get(row.categoryId) : undefined;
        const name = `${row?.name ?? key}${suffix}`;
        custom[taken(name) ? `${name} (${from ?? "old"})` : name] ??= value;
      };
      const loose = Object.keys(i.attributes).filter((k) => !mine.has(k) && foreign(k, i.categoryId));
      for (const k of loose) if (String(i.attributes[k]).trim()) place(k, String(i.attributes[k]), "");
      let unitMoved = false;
      for (const u of tx.select({ id: units.id, code: units.code, attributes: units.attributes }).from(units).where(eq(units.itemId, i.id)).all()) {
        const own = u.attributes ?? {};
        const out = Object.keys(own).filter((k) => !mine.has(k) && foreign(k, i.categoryId));
        if (out.length === 0) continue;
        for (const k of out) if (String(own[k]).trim()) place(k, String(own[k]), ` (${u.code})`);
        tx.update(units).set({ attributes: Object.fromEntries(Object.entries(own).filter(([k]) => !out.includes(k))) }).where(eq(units.id, u.id)).run();
        unitMoved = true;
      }
      if (loose.length === 0 && !unitMoved) continue;
      tx.update(items)
        .set({
          attributes: Object.fromEntries(Object.entries(i.attributes).filter(([k]) => !loose.includes(k))),
          custom,
          aiFields: Object.fromEntries(Object.entries(i.aiFields ?? {}).filter(([k]) => !loose.some((l) => k === `attributes.${l}`))),
        })
        .where(eq(items.id, i.id))
        .run();
      changed.add(i.id);
    }
    // A field no category has and none owns (a universal one nothing used any more) is gone.
    for (const [key, row] of rows) if (row.categoryId === null && !owner.has(key)) tx.delete(fields).where(eq(fields.id, row.id)).run();
  });
  return [...changed];
}

/**
 * Bring a database from name-derived keys ("voltage", made from the field's name) to field IDs
 * (DEC-071), once: each category's fields become rows of their own, same-named fields in
 * different categories staying separate, and
 * every stored value, AI mark and stored AI suggestion is re-keyed. A part's values that aren't
 * its category's fields become its custom fields. Safe to run again: field-ID keys are left
 * alone. Returns the parts changed, for re-indexing.
 */
export function migrateFields(db: Db): number[] {
  const changed = new Set<number>();
  db.transaction((tx) => {
    for (const c of tx.select().from(categories).all()) {
      if (c.fieldDefs.every((d) => isFieldKey(d.key))) continue;
      const map = new Map<string, string>();
      const next = c.fieldDefs.map((d) => {
        if (isFieldKey(d.key)) return d;
        const name = fieldName(d.label);
        const key = keyOf(tx.insert(fields).values({ name, categoryId: c.id }).returning({ id: fields.id }).get().id);
        map.set(d.key, key);
        return { ...d, key, label: name };
      });
      tx.update(categories).set({ fieldDefs: next }).where(eq(categories.id, c.id)).run();
      for (const i of tx.select().from(items).where(eq(items.categoryId, c.id)).all()) {
        const attributes = Object.fromEntries(Object.entries(i.attributes).map(([k, v]) => [map.get(k) ?? k, v]));
        const aiFields = Object.fromEntries(
          Object.entries(i.aiFields ?? {}).map(([k, v]) => [k.startsWith("attributes.") && map.has(k.slice(11)) ? `attributes.${map.get(k.slice(11))}` : k, v]),
        );
        const aiResult = i.aiResult
          ? { ...i.aiResult, suggestions: i.aiResult.suggestions.map((s) => (s.field.startsWith("attributes.") && map.has(s.field.slice(11)) ? { ...s, field: `attributes.${map.get(s.field.slice(11))}` } : s)) }
          : null;
        tx.update(items).set({ attributes, aiFields, aiResult }).where(eq(items.id, i.id)).run();
        changed.add(i.id);
        for (const u of tx.select({ id: units.id, attributes: units.attributes }).from(units).where(eq(units.itemId, i.id)).all()) {
          const own = Object.fromEntries(Object.entries(u.attributes ?? {}).flatMap(([k, v]) => (map.has(k) ? [[map.get(k)!, v]] : isFieldKey(k) ? [[k, v]] : [])));
          tx.update(units).set({ attributes: own }).where(eq(units.id, u.id)).run();
        }
      }
    }
    // What's left under a name is the part's own: its custom fields.
    for (const i of tx.select({ id: items.id, attributes: items.attributes, custom: items.custom, aiFields: items.aiFields }).from(items).all()) {
      const loose = Object.entries(i.attributes).filter(([k]) => !isFieldKey(k));
      const marks = Object.keys(i.aiFields ?? {}).filter((k) => k.startsWith("attributes.") && !isFieldKey(k.slice(11)));
      if (loose.length === 0 && marks.length === 0) continue;
      const custom = { ...(i.custom ?? {}) };
      for (const [k, v] of loose) if (String(v).trim()) custom[fieldName(k)] ??= String(v);
      tx.update(items)
        .set({
          attributes: Object.fromEntries(Object.entries(i.attributes).filter(([k]) => isFieldKey(k))),
          custom,
          aiFields: Object.fromEntries(Object.entries(i.aiFields ?? {}).filter(([k]) => !marks.includes(k))),
        })
        .where(eq(items.id, i.id))
        .run();
      changed.add(i.id);
    }
  });
  return [...changed];
}
