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
