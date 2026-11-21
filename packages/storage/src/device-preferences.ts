// Device-only preferences: kept out of the database and of backups on purpose.
const REST_ALERT_MUTED_KEY = "gym-local.rest-alert.muted";

export function isRestAlertMuted(): boolean {
  try {
    return globalThis.localStorage?.getItem(REST_ALERT_MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setRestAlertMuted(muted: boolean): void {
  try {
    if (muted) globalThis.localStorage?.setItem(REST_ALERT_MUTED_KEY, "1");
    else globalThis.localStorage?.removeItem(REST_ALERT_MUTED_KEY);
  } catch {
    // The preference only lasts for this visit when storage is unavailable.
  }
}

export type ThemePreference = "system" | "light" | "dark";

// index.html reads this key before the first paint; keep the two in sync.
const THEME_KEY = "gym-local.theme";

export function getThemePreference(): ThemePreference {
  try {
    const stored = globalThis.localStorage?.getItem(THEME_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === "system") globalThis.localStorage?.removeItem(THEME_KEY);
    else globalThis.localStorage?.setItem(THEME_KEY, preference);
  } catch {
    // The preference only lasts for this visit when storage is unavailable.
  }
}
