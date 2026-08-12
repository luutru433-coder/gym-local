import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { defaultSettings } from "@gym/storage";
import { cloneRoutineTemplate, createSessionFromRoutine } from "@gym/workouts";
import { createBackup, readBackup } from "./index";

describe("backup", () => {
  it("round-trips Vietnamese text and manifest checksum", async () => {
    const routine = cloneRoutineTemplate("tpl_full_body_a");
    const session = createSessionFromRoutine(routine);
    const data = {
      profile: undefined,
      routines: [routine],
      sessions: [session],
      foods: [],
      meals: [],
      bodyMetrics: [],
      customVariants: [],
      settings: defaultSettings
    };
    const blob = await createBackup(data);
    const restored = await readBackup(blob);
    expect(restored.data.settings.catalogVersion).toBe(3);
    expect(restored.manifest.backupVersion).toBe(2);
    expect(restored.data.routines[0].name.vi).toContain("Người mới");
    expect(restored.data.sessions[0].exercises[0].sets[0]).toMatchObject({ targetMinReps: 8, targetMaxReps: 12 });
  });

  it("keeps micronutrients and upgrades supported v1 settings on import", async () => {
    const legacy = {
      profile: undefined,
      routines: [],
      sessions: [],
      foods: [{
        id: "food_spinach",
        name: { vi: "Rau bina", en: "Spinach" },
        per100g: { calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, ironMg: 2.7, vitaminCMg: 28.1 },
        source: "custom",
        updatedAt: "2026-08-10T00:00:00.000Z"
      }],
      meals: [],
      bodyMetrics: [],
      customVariants: [],
      settings: { ...defaultSettings, dbSchemaVersion: 1, backupVersion: 1 }
    };
    const serialized = JSON.stringify(legacy);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
    const checksum = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify({ appVersion: "0.1.0", backupVersion: 1, exportedAt: "2026-08-10T00:00:00.000Z", checksum }));
    zip.file("data.json", serialized);

    const restored = await readBackup(await zip.generateAsync({ type: "blob" }));
    expect(restored.data.foods[0].per100g).toMatchObject({ ironMg: 2.7, vitaminCMg: 28.1 });
    expect(restored.data.settings).toMatchObject({ dbSchemaVersion: 2, backupVersion: 2 });
  });

  it("rejects a backup whose data no longer matches its checksum", async () => {
    const data = {
      profile: undefined,
      routines: [],
      sessions: [],
      foods: [],
      meals: [],
      bodyMetrics: [],
      customVariants: [],
      settings: defaultSettings
    };
    const original = await createBackup(data);
    const zip = await JSZip.loadAsync(original);
    zip.file("data.json", JSON.stringify({ ...data, routines: [{ id: "tampered" }] }));
    const tampered = await zip.generateAsync({ type: "blob" });

    await expect(readBackup(tampered)).rejects.toThrow("checksum");
  });

  it("rejects malformed nested records before replacing local data", async () => {
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify({ appVersion: "0.1.0", backupVersion: 1, exportedAt: "2026-08-10T00:00:00.000Z" }));
    zip.file("data.json", JSON.stringify({
      routines: [],
      sessions: [{ id: "broken-session", exercises: "not-an-array" }],
      foods: [],
      meals: [],
      bodyMetrics: [],
      customVariants: [],
      settings: defaultSettings
    }));
    const malformed = await zip.generateAsync({ type: "blob" });

    await expect(readBackup(malformed)).rejects.toThrow();
  });

  it("refuses to create a backup containing non-finite nutrition data", async () => {
    const data = {
      profile: undefined,
      routines: [],
      sessions: [],
      foods: [{
        id: "food_bad",
        name: { vi: "Lỗi", en: "Bad" },
        per100g: { calories: Number.NaN, protein: 1, carbs: 1, fat: 1 },
        source: "custom" as const,
        updatedAt: "2026-08-10T00:00:00.000Z"
      }],
      meals: [],
      bodyMetrics: [],
      customVariants: [],
      settings: defaultSettings
    };
    await expect(createBackup(data)).rejects.toThrow();
  });

  it("refuses to create a backup with an invalid active-session pointer", async () => {
    const data = {
      profile: undefined,
      routines: [],
      sessions: [],
      foods: [],
      meals: [],
      bodyMetrics: [],
      customVariants: [],
      settings: { ...defaultSettings, activeSessionId: "session_missing" }
    };
    await expect(createBackup(data)).rejects.toThrow("active workout pointer");
  });
});
