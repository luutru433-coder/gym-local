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

const CALORIE_CHECK_SNOOZE_KEY = "gym-local.calorie-check.snoozed-until";

/** Local day (YYYY-MM-DD) until which the calorie target suggestion stays hidden. */
export function calorieCheckSnoozedUntil(): string | undefined {
  try {
    return globalThis.localStorage?.getItem(CALORIE_CHECK_SNOOZE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function snoozeCalorieCheck(until: string): void {
  try {
    globalThis.localStorage?.setItem(CALORIE_CHECK_SNOOZE_KEY, until);
  } catch {
    // The suggestion simply shows again on the next visit when storage is unavailable.
  }
}
