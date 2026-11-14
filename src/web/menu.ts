import { useSyncExternalStore } from "react";

// The menu (issue #3, DEC-078): the sidebar's entries in their usual order, and this device's own
// order when they've been dragged around. The order is a device preference, like the theme: kept
// in localStorage, never on the server. The phone's bottom bar is fixed; its Menu lists the
// entries the bar doesn't hold, in the same order.

export const MENU = [
  { id: "inventory", to: "/", label: "Inventory", end: true },
  { id: "locations", to: "/locations", label: "Locations", end: false },
  { id: "search", to: "/search", label: "Search", end: true },
  { id: "putback", to: "/putback", label: "Put-back", end: true },
  { id: "activity", to: "/activity", label: "Activity", end: true },
  { id: "categories", to: "/categories", label: "Categories", end: true },
  { id: "stickers", to: "/stickers/print", label: "Print stickers", end: true },
  { id: "settings", to: "/settings", label: "Settings", end: true },
] as const;
export type MenuId = (typeof MENU)[number]["id"];
/** What the phone's bottom bar already holds. */
export const IN_PHONE_BAR: MenuId[] = ["inventory", "locations", "activity", "putback"];

const KEY = "menu.order";
const usual = MENU.map((m) => m.id);

/** A saved order made whole: unknown names dropped, entries it doesn't mention added where they usually sit. */
export function menuOrder(saved: unknown): MenuId[] {
  const known = Array.isArray(saved) ? [...new Set(saved.filter((x): x is MenuId => usual.includes(x as MenuId)))] : [];
  const out = [...known];
  for (const id of usual) {
    if (out.includes(id)) continue;
    // After the nearest entry before it in the usual order that is already placed.
    const before = usual.slice(0, usual.indexOf(id)).reverse().find((x) => out.includes(x));
    out.splice(before ? out.indexOf(before) + 1 : 0, 0, id);
  }
  return out;
}

/** `id` taken out and put where `before` is (or at the end). */
export function moveMenuItem(order: MenuId[], id: MenuId, before: MenuId | null): MenuId[] {
  if (id === before) return order;
  const rest = order.filter((x) => x !== id);
  const at = before ? rest.indexOf(before) : -1;
  rest.splice(at < 0 ? rest.length : at, 0, id);
  return rest;
}

const listeners = new Set<() => void>();
let cached: { raw: string | null; order: MenuId[] } | undefined;
function read(): MenuId[] {
  const raw = localStorage.getItem(KEY);
  if (!cached || cached.raw !== raw) {
    let saved: unknown = null;
    try {
      saved = raw ? JSON.parse(raw) : null;
    } catch {
      saved = null;
    }
    cached = { raw, order: menuOrder(saved) };
  }
  return cached.order;
}
/** Save this device's order; the usual order is saved as nothing at all. */
export function setMenuOrder(order: MenuId[] | null) {
  if (!order || order.join() === usual.join()) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(order));
  for (const l of listeners) l();
}
export function useMenuOrder(): { order: MenuId[]; changed: boolean } {
  const order = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
  );
  return { order, changed: order.join() !== usual.join() };
}
