import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Profile, WorkoutSession } from "@gym/contracts";
import {
  GymDatabase,
  defaultSettings,
  exportAllData,
  getActiveSession,
  getProfile,
  initializeDatabase,
  replaceAllData,
  getNutritionPackRecord,
  saveProfile,
  saveNutritionPackRecord,
  saveSession
} from "./index";

const databases: GymDatabase[] = [];

function makeDatabase(): GymDatabase {
  const db = new GymDatabase(`gym-local-test-${crypto.randomUUID()}`);
  databases.push(db);
  return db;
}

function profile(): Profile {
  const now = "2026-08-10T00:00:00.000Z";
  return {
    id: "profile",
    displayName: "Local lifter",
    locale: "vi",
    units: "metric",
    goal: "hypertrophy",
    experience: "beginner",
    daysPerWeek: 3,
    locations: [{ id: "home", name: "Home", equipment: ["dumbbell", "bench"] }],
    activeLocationId: "home",
    onboardingComplete: true,
    createdAt: now,
    updatedAt: now
  };
}

beforeEach(() => databases.splice(0));
afterEach(async () => {
  for (const db of databases) {
    db.close();
    await db.delete();
  }
});

describe("IndexedDB schema and recovery", () => {
  it("initializes schema v2 and round-trips all backup collections", async () => {
    const source = makeDatabase();
    await initializeDatabase(source);
    await saveProfile(profile(), source);
    const exported = await exportAllData(source);

    expect(source.verno).toBe(2);
    expect(exported.settings.dbSchemaVersion).toBe(2);
    expect(exported.profile?.displayName).toBe("Local lifter");

    const target = makeDatabase();
    await initializeDatabase(target);
    await replaceAllData(exported, target);

    expect(await getProfile(target)).toEqual(exported.profile);
    expect(await exportAllData(target)).toEqual(exported);
  });

  it("migrates v1 settings additively and keeps an installed nutrition pack during restore", async () => {
    const name = `gym-local-migration-${crypto.randomUUID()}`;
    const legacy = new Dexie(name);
    legacy.version(1).stores({
      profiles: "id, updatedAt",
      routines: "id, goal, updatedAt, sourceTemplateId",
      sessions: "id, routineId, startedAt, finishedAt, locationId",
      foods: "id, barcode, updatedAt",
      meals: "id, date, meal, foodId, createdAt",
      bodyMetrics: "id, date",
      customVariants: "id, movementId, reviewStatus",
      settings: "id"
    });
    await legacy.table("settings").put({ ...defaultSettings, dbSchemaVersion: 1, backupVersion: 1 });
    legacy.close();

    const db = new GymDatabase(name);
    databases.push(db);
    await initializeDatabase(db);
    expect((await db.settings.get("app"))?.dbSchemaVersion).toBe(2);

    await saveNutritionPackRecord({ id: "nutrition-pack", status: "ready", version: "2026.04", bytesDownloaded: 123, installedAt: "2026-08-10T00:00:00.000Z" }, db);
    const data = await exportAllData(db);
    await replaceAllData(data, db);
    expect(await getNutritionPackRecord(db)).toMatchObject({ status: "ready", version: "2026.04" });
  });

  it("recovers an unfinished session and clears the pointer after finish", async () => {
    const db = makeDatabase();
    await initializeDatabase(db);
    const session: WorkoutSession = {
      id: "session_active",
      startedAt: "2026-08-10T01:00:00.000Z",
      exercises: []
    };

    await saveSession(session, db);
    expect((await getActiveSession(db))?.id).toBe(session.id);

    await saveSession({ ...session, finishedAt: "2026-08-10T02:00:00.000Z" }, db);
    expect(await getActiveSession(db)).toBeUndefined();
    expect((await db.settings.get("app")) ?? defaultSettings).toMatchObject({ activeSessionId: undefined });
  });

  it("serializes concurrent autosaves in call order", async () => {
    const db = makeDatabase();
    await initializeDatabase(db);
    const session: WorkoutSession = {
      id: "session_queued",
      startedAt: "2026-08-10T01:00:00.000Z",
      exercises: []
    };
    const finished = { ...session, finishedAt: "2026-08-10T02:00:00.000Z" };

    await Promise.all([saveSession(session, db), saveSession(finished, db)]);

    expect((await db.sessions.get(session.id))?.finishedAt).toBe(finished.finishedAt);
    expect(await getActiveSession(db)).toBeUndefined();
  });
});
