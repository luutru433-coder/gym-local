import { getThemePreference, setThemePreference, type ThemePreference } from "@gym/storage/device";

export type { ThemePreference };

const THEME_COLORS = { light: "#f2efe6", dark: "#121410" } as const;

function systemTheme(): MediaQueryList | undefined {
  return typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : undefined;
}

export function applyTheme(preference: ThemePreference = getThemePreference()): void {
  const theme = preference === "system" ? (systemTheme()?.matches ? "dark" : "light") : preference;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
}

export function saveThemePreference(preference: ThemePreference): void {
  setThemePreference(preference);
  applyTheme(preference);
}

export function initTheme(): void {
  applyTheme();
  systemTheme()?.addEventListener?.("change", () => applyTheme());
}

export { getThemePreference };
