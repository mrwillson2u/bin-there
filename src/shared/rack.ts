// Moving things between a rack's positions (DEC-035). A rack is a row of positions, each
// holding one place's id or nothing. Shared by the server (which saves it) and the screen
// (which shows the result while you drag), so the two always agree.

export type RackRow = (number | null)[];

/**
 * Where everything ends up when `id` is dropped on position `to` (null = out of a position).
 * - On an empty position: it just goes there.
 * - On a taken one, from another position: it goes there and everything between its old and
 *   new position moves along one, the way a list reorders.
 * - On a taken one, from outside the rack's positions: the ones from there on make room by
 *   moving down into the next empty position (or, if there's none below, up into one above).
 * Returns null when there's no room (every position is taken).
 */
export function rackMove(row: RackRow, id: number, to: number | null): RackRow | null {
  const next = row.slice();
  const from = next.indexOf(id);
  if (to === null) {
    if (from >= 0) next[from] = null;
    return next;
  }
  if (to < 0 || to >= next.length) return null;
  if (from === to) return next;
  if (next[to] === null) {
    if (from >= 0) next[from] = null;
    next[to] = id;
    return next;
  }
  if (from >= 0) {
    next.splice(from, 1);
    next.splice(to, 0, id);
    return next;
  }
  let gap = next.indexOf(null, to);
  if (gap < 0) gap = next.lastIndexOf(null, to);
  if (gap < 0) return null;
  next.splice(gap, 1);
  next.splice(to, 0, id);
  return next;
}
