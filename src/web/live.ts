// Live updates (DEC-046). One stream per open screen on GET /api/changes; when another device
// (or another tab) writes, every query on this screen is refetched. Our own writes carry this
// tab's id, so their echo is ignored: the screen already refreshed itself after them.
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/** This tab's id, sent with every write as `X-Client`. */
export const clientId = Math.random().toString(36).slice(2) + Date.now().toString(36);

export function useLiveUpdates() {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    let seen: number | null = null;
    const source = new EventSource("/api/changes");
    source.addEventListener("change", (e) => {
      const { version, by } = JSON.parse((e as MessageEvent<string>).data) as { version: number; by: string | null };
      // The first message after (re)connecting only says where the server is now; refetch if
      // that moved while we were away. Later ones are real changes.
      const changed = seen !== null && version !== seen && by !== clientId;
      seen = version;
      if (changed) queryClient.invalidateQueries();
    });
    // The browser reconnects by itself after an error (a phone waking up, the server restarting).
    return () => source.close();
  }, [queryClient]);
}
