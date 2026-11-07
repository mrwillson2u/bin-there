// Live updates (DEC-046). Every write to the API bumps a version; open screens listen on
// `GET /api/changes` (server-sent events) and refetch when the number moves. The write's
// client id travels with the ping so the device that made the change can ignore its own echo.

export type Change = { version: number; by: string | null };

export class Changes {
  version = 0;
  private listeners = new Set<(change: Change) => void>();

  /** Called after a write succeeds. `by` is the writer's `X-Client` header, if it sent one. */
  bump(by: string | null) {
    this.version++;
    const change = { version: this.version, by };
    for (const fn of this.listeners) fn(change);
  }

  subscribe(fn: (change: Change) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
}
