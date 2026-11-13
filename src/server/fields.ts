import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./db/schema";
import { categories, fields, items, units, type FieldDef } from "./db/schema";
import { ApiError } from "./errors";
import { bare, fieldName } from "../shared/fields";

// Fields (DEC-071). Every category field is one row in `fields` with its own ID; its key
// everywhere else ("f12" in a category's template, a part's values, a unit's values, the AI
// marks) is that ID, never its name. Three kinds:
//   universal      one field used by any number of categories; its value follows the part
//   category-only  belongs to one category; its value stays behind when the part leaves
//   custom         on one part only: `items.custom`, by name, a separate store
// Names are compared in one place only, when a field is made, to offer an existing one.

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

/** Every universal field: key to name. */
export function universalFields(db: Db): Map<string, string> {
  return new Map(db.select().from(fields).where(eq(fields.universal, true)).all().map((f) => [keyOf(f.id), f.name]));
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

export function makeUniversal(db: Db, key: string) {
  db.update(fields).set({ universal: true, categoryId: null }).where(eq(fields.id, idOf(key))).run();
  rewriteEverywhere(db, key, (d) => ({ ...d, universal: true }));
}

const rekeyMap = <V>(map: Record<string, V>, from: string, to: string): Record<string, V> | null => {
  if (!(from in map)) return null;
  const { [from]: moved, ...rest } = map;
  return to in rest && String(rest[to] ?? "").trim() ? rest : { ...rest, [to]: moved! };
};

/**
 * Two fields are really one (the Voltage of Capacitors and the Voltage of Resistors): `other`
 * becomes `keep` everywhere, and `keep` is universal. A part or unit holding a value under both
 * keeps the one under `keep`. Refused when one category has both. Returns the parts changed.
 */
export function mergeFields(db: Db, keep: string, other: string): number[] {
  const a = fieldRow(db, keep);
  const b = fieldRow(db, other);
  if (!a || !b || keep === other) throw new ApiError(400, "VALIDATION", "Those aren't two different fields");
  const cats = db.select({ id: categories.id, name: categories.name, fieldDefs: categories.fieldDefs }).from(categories).all();
  const both = cats.find((c) => c.fieldDefs.some((d) => d.key === keep) && c.fieldDefs.some((d) => d.key === other));
  if (both) throw new ApiError(400, "VALIDATION", `${both.name} has both of those fields; remove one there first`);
  const changed: number[] = [];
  db.transaction((tx) => {
    for (const c of cats) {
      if (!c.fieldDefs.some((d) => d.key === other)) continue;
      tx.update(categories).set({ fieldDefs: c.fieldDefs.map((d) => (d.key === other ? { ...d, key: keep, label: a.name } : d)) }).where(eq(categories.id, c.id)).run();
    }
    for (const i of tx.select({ id: items.id, attributes: items.attributes, aiFields: items.aiFields, aiResult: items.aiResult }).from(items).all()) {
      const attributes = rekeyMap(i.attributes, other, keep);
      const aiFields = rekeyMap(i.aiFields ?? {}, `attributes.${other}`, `attributes.${keep}`);
      const hit = i.aiResult?.suggestions.some((s) => s.field === `attributes.${other}`);
      if (!attributes && !aiFields && !hit) continue;
      tx.update(items)
        .set({
          ...(attributes ? { attributes } : {}),
          ...(aiFields ? { aiFields } : {}),
          ...(hit ? { aiResult: { ...i.aiResult!, suggestions: i.aiResult!.suggestions.map((s) => (s.field === `attributes.${other}` ? { ...s, field: `attributes.${keep}` } : s)) } } : {}),
        })
        .where(eq(items.id, i.id))
        .run();
      changed.push(i.id);
    }
    for (const u of tx.select({ id: units.id, attributes: units.attributes }).from(units).all()) {
      const attributes = rekeyMap(u.attributes ?? {}, other, keep);
      if (attributes) tx.update(units).set({ attributes }).where(eq(units.id, u.id)).run();
    }
    tx.delete(fields).where(eq(fields.id, idOf(other))).run();
  });
  makeUniversal(db, keep);
  return changed;
}

/**
 * Bring a database from name-derived keys ("voltage", made from the field's name) to field IDs
 * (DEC-071), once: each category's fields become rows of their own, same-named fields in
 * different categories staying separate (the owner says which are really one, with Merge), and
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
