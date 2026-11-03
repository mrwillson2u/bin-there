// Appearance: dark (the default), light, or follow the device. Stored on this
// device only. The color tokens live in index.css; this just sets html[data-theme].

export const themes = ["system", "dark", "light"] as const;
export type Theme = (typeof themes)[number];
export const themeLabels: Record<Theme, string> = { system: "Device", dark: "Dark", light: "Light" };

const KEY = "bin-there:theme";
const colors = { dark: "#0e0f11", light: "#f4f5f7" };

export function getTheme(): Theme {
  const t = localStorage.getItem(KEY);
  return themes.includes(t as Theme) ? (t as Theme) : "dark";
}

export function setTheme(t: Theme) {
  localStorage.setItem(KEY, t);
  applyTheme();
}

/** Resolve "system" to what the device wants right now. */
function resolve(t: Theme): "dark" | "light" {
  if (t !== "system") return t;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyTheme() {
  const mode = resolve(getTheme());
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", colors[mode]);
}

/** Apply at start and again if the device switches while following it. */
export function installTheme() {
  applyTheme();
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (getTheme() === "system") applyTheme();
  });
}
