import { useSyncExternalStore } from "react";

// Desktop / Pi screen layout (style guide breakpoint lg: ≥1024px).
const query = "(min-width: 1024px)";

export function useWide(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
  );
}
