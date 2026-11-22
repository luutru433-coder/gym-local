/** The app has one look (ADR 0023): dark with an orange accent. */
const THEME_COLOR = "#0b0b0c";

export function initTheme(): void {
  document.documentElement.dataset.theme = "dark";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR);
}
