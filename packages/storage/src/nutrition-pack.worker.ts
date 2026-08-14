/// <reference lib="webworker" />

import sqlite3InitModule, { type Database, type SAHPoolUtil } from "@sqlite.org/sqlite-wasm";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { APP_VERSIONS, type NutritionPackManifest } from "@gym/contracts";
import { commitStagedNutritionPack, downloadNutritionPack, obsoletePackFileAfterActivation } from "./providers/nutrition-pack";

const LEGACY_PACK_FILENAME = "/gym-local-nutrition.sqlite3";
const CONTROL_FILENAME = "/gym-local-nutrition-control.sqlite3";
const PACK_PREFIX = "/gym-local-nutrition-pack-";

type WorkerRequest =
  | { id: string; type: "init" }
  | { id: string; type: "install"; manifest: NutritionPackManifest }
  | { id: string; type: "search"; query: string; limit: number }
  | { id: string; type: "remove" };

interface PackPointer {
  activeFileName: string;
  previousFileName?: string;
  manifest?: NutritionPackManifest;
}

interface PackCandidate {
  fileName: string;
  manifest?: NutritionPackManifest;
  recovered?: boolean;
}

let poolPromise: Promise<SAHPoolUtil> | undefined;
let database: Database | undefined;
let databaseFileName: string | undefined;
let activeManifest: NutritionPackManifest | undefined;
let recoveredPack = false;

function post(id: string, type: string, payload: unknown = undefined): void {
  self.postMessage({ id, type, payload });
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function pool(): Promise<SAHPoolUtil> {
  if (!poolPromise) {
    poolPromise = sqlite3InitModule().then(async (sqlite3) => {
      const installed = await sqlite3.installOpfsSAHPoolVfs({
        initialCapacity: 8,
        directory: "/gym-local/nutrition",
        name: "gym-local-nutrition"
      });
      await installed.reserveMinimumCapacity(8);
      return installed;
    });
  }
  return poolPromise;
}

function closeDatabase(): void {
  try {
    database?.close();
  } catch {
    // Reset the handle so the next operation reopens the last active pack.
  }
  database = undefined;
  databaseFileName = undefined;
  activeManifest = undefined;
  recoveredPack = false;
}

function manifestFromJson(value: unknown): NutritionPackManifest | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<NutritionPackManifest>;
    return parsed.id === "gym-local-nutrition" && typeof parsed.version === "string"
      ? parsed as NutritionPackManifest
      : undefined;
  } catch {
    return undefined;
  }
}

async function readPointer(): Promise<PackPointer | undefined> {
  const installedPool = await pool();
  if (!installedPool.getFileNames().includes(CONTROL_FILENAME)) return undefined;
  let control: Database | undefined;
  try {
    control = new installedPool.OpfsSAHPoolDb(CONTROL_FILENAME);
    const rows = control.exec({
      sql: "SELECT active_filename, previous_filename, manifest_json FROM pack_pointer WHERE slot = 1",
      rowMode: "object",
      returnValue: "resultRows"
    });
    const row = rows[0];
    if (!row?.active_filename) return undefined;
    return {
      activeFileName: String(row.active_filename),
      previousFileName: row.previous_filename ? String(row.previous_filename) : undefined,
      manifest: manifestFromJson(row.manifest_json)
    };
  } catch {
    return undefined;
  } finally {
    try {
      control?.close();
    } catch {
      // Reading the pointer already completed; reopen the control DB next time.
    }
  }
}

async function writePointer(pointer: PackPointer): Promise<void> {
  const installedPool = await pool();
  let control: Database | undefined;
  try {
    control = new installedPool.OpfsSAHPoolDb(CONTROL_FILENAME);
    control.exec(`CREATE TABLE IF NOT EXISTS pack_pointer (
      slot INTEGER PRIMARY KEY CHECK (slot = 1),
      active_filename TEXT NOT NULL,
      previous_filename TEXT,
      manifest_json TEXT
    )`);
    control.exec("BEGIN IMMEDIATE");
    control.exec({
      sql: `INSERT INTO pack_pointer(slot, active_filename, previous_filename, manifest_json)
        VALUES (1, $active, $previous, $manifest)
        ON CONFLICT(slot) DO UPDATE SET
          active_filename = excluded.active_filename,
          previous_filename = excluded.previous_filename,
          manifest_json = excluded.manifest_json`,
      bind: {
        $active: pointer.activeFileName,
        $previous: pointer.previousFileName ?? null,
        $manifest: pointer.manifest ? JSON.stringify(pointer.manifest) : null
      }
    });
    control.exec("COMMIT");
  } catch (error) {
    try {
      control?.exec("ROLLBACK");
    } catch {
      // The original pointer failure is the actionable error.
    }
    throw error;
  } finally {
    try {
      control?.close();
    } catch {
      // COMMIT is the atomic boundary; closing the local handle is best effort.
    }
  }
}

function ftsQuery(query: string): string {
  return query
    .normalize("NFC")
    .replace(/["'():*^{}[\]]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .map((token) => `"${token}"*`)
    .join(" ");
}

function readMetadata(db: Database): Record<string, string> {
  const columns = db.exec({
    sql: "PRAGMA table_info(pack_meta)",
    rowMode: "object",
    returnValue: "resultRows"
  });
  const identifierColumn = columns.some((column) => column.name === "id") ? "id" : "key";
  const rows = db.exec({
    sql: `SELECT ${identifierColumn} AS key, value FROM pack_meta`,
    rowMode: "object",
    returnValue: "resultRows"
  });
  return Object.fromEntries(rows.map((row) => [String(row.key), String(row.value)]));
}

function validatePack(db: Database, manifest?: NutritionPackManifest): Record<string, string> {
  const integrityRows = db.exec({
    sql: "PRAGMA integrity_check",
    rowMode: "array",
    returnValue: "resultRows"
  });
  if (String(integrityRows[0]?.[0]) !== "ok") throw new Error("Nutrition pack integrity check failed");

  const metadata = readMetadata(db);
  if (metadata.id !== "gym-local-nutrition") throw new Error("Nutrition pack identity is invalid");
  const schemaVersion = Number(metadata.schema_version);
  if (schemaVersion < APP_VERSIONS.minimumNutritionPackSchema || schemaVersion > APP_VERSIONS.nutritionPackSchema) {
    throw new Error(`Nutrition pack schema ${metadata.schema_version || "unknown"} is not supported`);
  }
  if (manifest) {
    if (manifest.schemaVersion < APP_VERSIONS.minimumNutritionPackSchema
      || manifest.schemaVersion > APP_VERSIONS.nutritionPackSchema
      || schemaVersion !== manifest.schemaVersion) {
      throw new Error("Nutrition pack schema does not match its manifest");
    }
    if (metadata.version !== manifest.version) throw new Error("Nutrition pack version does not match its manifest");
    const expectedCounts: Array<[string, number]> = [
      ["food_count", manifest.foodCount],
      ["alias_count", manifest.aliasCount],
      ["vietnamese_recipe_count", manifest.vietnameseRecipeCount],
      ...(manifest.foodGroupCount === undefined ? [] : [["food_group_count", manifest.foodGroupCount] as [string, number]]),
      ...(manifest.recipeIngredientCount === undefined ? [] : [["recipe_ingredient_count", manifest.recipeIngredientCount] as [string, number]])
    ];
    if (expectedCounts.some(([key, value]) => Number(metadata[key]) !== value)) {
      throw new Error("Nutrition pack counts do not match its manifest");
    }
  }

  const sampleRows = db.exec({
    sql: "SELECT name_en FROM foods WHERE name_en <> '' LIMIT 1",
    rowMode: "object",
    returnValue: "resultRows"
  });
  const sampleName = String(sampleRows[0]?.name_en ?? "");
  if (!sampleName) throw new Error("Nutrition pack contains no searchable foods");
  const match = ftsQuery(sampleName.split(/\s+/)[0] ?? "");
  const searchRows = db.exec({
    sql: `SELECT f.id FROM food_fts JOIN foods f ON f.rowid = food_fts.rowid
      WHERE food_fts MATCH $match LIMIT 1`,
    bind: { $match: match },
    rowMode: "object",
    returnValue: "resultRows"
  });
  if (!searchRows.length) throw new Error("Nutrition pack search smoke test failed");
  return metadata;
}

async function openDatabase(): Promise<Database | undefined> {
  if (database) return database;
  const installedPool = await pool();
  const pointer = await readPointer();
  const discoveredFiles = installedPool.getFileNames()
    .filter((fileName) => fileName.startsWith(PACK_PREFIX))
    .sort((left, right) => right.localeCompare(left));
  const candidates: Array<PackCandidate | undefined> = [
    pointer?.activeFileName ? { fileName: pointer.activeFileName, manifest: pointer.manifest } : undefined,
    pointer?.previousFileName ? { fileName: pointer.previousFileName, recovered: true } : undefined,
    ...discoveredFiles.map((fileName) => ({ fileName, recovered: true })),
    { fileName: LEGACY_PACK_FILENAME, recovered: Boolean(pointer) }
  ];
  const presentCandidates = candidates.filter((candidate): candidate is PackCandidate => Boolean(candidate));
  const uniqueCandidates = presentCandidates.filter((candidate, index) =>
    presentCandidates.findIndex((item) => item.fileName === candidate.fileName) === index
  );

  for (const candidate of uniqueCandidates) {
    if (!installedPool.getFileNames().includes(candidate.fileName)) continue;
    let opened: Database | undefined;
    try {
      opened = new installedPool.OpfsSAHPoolDb(candidate.fileName);
      opened.exec("PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;");
      validatePack(opened, candidate.manifest);
      database = opened;
      databaseFileName = candidate.fileName;
      activeManifest = candidate.manifest;
      recoveredPack = Boolean(candidate.recovered);
      if (candidate.recovered) {
        try {
          await writePointer({
            activeFileName: candidate.fileName,
            previousFileName: pointer?.activeFileName !== candidate.fileName ? pointer?.activeFileName : undefined
          });
        } catch {
          // The validated fallback remains usable for this worker lifetime.
        }
      }
      return database;
    } catch {
      try {
        opened?.close();
      } catch {
        // Continue to the previous pack candidate.
      }
    }
  }
  return undefined;
}

async function packInfo() {
  const pointerBeforeOpen = await readPointer();
  const db = await openDatabase();
  if (!db) return { installed: false, recoveredInvalidPack: Boolean(pointerBeforeOpen) };
  return {
    installed: true,
    metadata: readMetadata(db),
    manifest: activeManifest,
    activeFileName: databaseFileName,
    recoveredPreviousPack: recoveredPack || Boolean(pointerBeforeOpen && databaseFileName !== pointerBeforeOpen.activeFileName)
  };
}

function compareVersions(left: string, right: string): number {
  const parse = (version: string) => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
    if (!match) throw new Error(`Invalid application version: ${version}`);
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  };
  const leftParts = parse(left);
  const rightParts = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

function validateInstallManifest(manifest: NutritionPackManifest): void {
  if (manifest.id !== "gym-local-nutrition") throw new Error("Invalid nutrition pack manifest");
  if (manifest.schemaVersion < APP_VERSIONS.minimumNutritionPackSchema
    || manifest.schemaVersion > APP_VERSIONS.nutritionPackSchema) throw new Error("Unsupported nutrition pack schema");
  if (compareVersions(APP_VERSIONS.app, manifest.minimumAppVersion) < 0) throw new Error("Gym Local must be updated before installing this pack");
  if (!Number.isInteger(manifest.sizeBytes) || manifest.sizeBytes <= 0) throw new Error("Invalid nutrition pack size");
  if (!/^[a-f0-9]{64}$/i.test(manifest.sha256)) throw new Error("Invalid nutrition pack checksum");
}

function stagedFileName(id: string, manifest: NutritionPackManifest): string {
  const safeVersion = manifest.version.replace(/[^a-zA-Z0-9.-]/g, "-").slice(0, 40);
  const safeId = id.replace(/[^a-zA-Z0-9-]/g, "-").slice(-36);
  return `${PACK_PREFIX}${safeVersion}-${manifest.sha256.slice(0, 12)}-${safeId}.sqlite3`;
}

async function install(id: string, manifest: NutritionPackManifest) {
  validateInstallManifest(manifest);
  const response = await downloadNutritionPack(manifest.downloadUrl);
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength && declaredLength !== manifest.sizeBytes) throw new Error("Nutrition pack size does not match its manifest");

  const installedPool = await pool();
  await installedPool.reserveMinimumCapacity(8);
  await openDatabase();
  const oldActiveFileName = databaseFileName;
  const oldPointer = await readPointer();
  const stageFileName = stagedFileName(id, manifest);
  if (installedPool.getFileNames().includes(stageFileName)) installedPool.unlink(stageFileName);

  const reader = response.body!.getReader();
  const hasher = sha256.create();
  let downloaded = 0;
  try {
    return await commitStagedNutritionPack({
      prepare: async () => {
        const imported = await installedPool.importDb(stageFileName, async () => {
          const { done, value } = await reader.read();
          if (done) return undefined;
          downloaded += value.byteLength;
          hasher.update(value);
          post(id, "progress", { bytesDownloaded: downloaded, totalBytes: manifest.sizeBytes });
          return value;
        });
        if (imported !== manifest.sizeBytes || downloaded !== manifest.sizeBytes) {
          throw new Error("Nutrition pack download is incomplete");
        }
        const checksum = bytesToHex(hasher.digest());
        if (checksum !== manifest.sha256.toLowerCase()) throw new Error("Nutrition pack SHA-256 does not match its manifest");

        let stagedDatabase: Database | undefined;
        try {
          stagedDatabase = new installedPool.OpfsSAHPoolDb(stageFileName);
          stagedDatabase.exec("PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;");
          return { checksum, metadata: validatePack(stagedDatabase, manifest) };
        } finally {
          stagedDatabase?.close();
        }
      },
      activate: async ({ checksum, metadata }) => {
        const nextPreviousFileName = oldActiveFileName && oldActiveFileName !== stageFileName
          ? oldActiveFileName
          : oldPointer?.previousFileName;
        closeDatabase();
        await writePointer({
          activeFileName: stageFileName,
          previousFileName: nextPreviousFileName,
          manifest
        });
        const obsoleteFileName = obsoletePackFileAfterActivation(
          oldPointer?.previousFileName,
          stageFileName,
          nextPreviousFileName
        );
        if (obsoleteFileName
          && (obsoleteFileName === LEGACY_PACK_FILENAME || obsoleteFileName.startsWith(PACK_PREFIX))
          && installedPool.getFileNames().includes(obsoleteFileName)) {
          try {
            installedPool.unlink(obsoleteFileName);
          } catch {
            // Activation is already committed; orphan cleanup can be retried later.
          }
        }
        return {
          installed: true,
          metadata,
          manifest,
          activeFileName: stageFileName,
          checksum,
          bytesDownloaded: downloaded
        };
      },
      discardStaged: () => {
        if (installedPool.getFileNames().includes(stageFileName)) installedPool.unlink(stageFileName);
      }
    });
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The stream is already complete or failed; pack activation state is final.
    }
  }
}

async function search(query: string, limit: number) {
  const db = await openDatabase();
  if (!db) throw new Error("Offline nutrition pack is not installed");
  const match = ftsQuery(String(query));
  if (!match) return [];
  return db.exec({
    sql: `SELECT f.id, f.name_vi, f.name_en, f.source, f.source_food_id, f.source_url,
      f.serving_label, f.serving_grams, f.calories, f.protein, f.carbs, f.fat,
      f.fiber, f.sugar, f.sodium_mg, f.calcium_mg, f.iron_mg, f.potassium_mg,
      f.magnesium_mg, f.zinc_mg, f.vitamin_a_mcg, f.vitamin_c_mg, f.vitamin_d_mcg,
      f.vitamin_e_mg, f.vitamin_k_mcg, f.vitamin_b6_mg, f.vitamin_b12_mcg,
      f.folate_mcg, f.data_quality
      FROM food_fts JOIN foods f ON f.rowid = food_fts.rowid
      WHERE food_fts MATCH $match ORDER BY bm25(food_fts) LIMIT $limit`,
    bind: { $match: match, $limit: Math.min(50, Math.max(1, Number(limit) || 30)) },
    rowMode: "object",
    returnValue: "resultRows"
  });
}

async function remove() {
  closeDatabase();
  const installedPool = await pool();
  let removed = false;
  for (const fileName of installedPool.getFileNames()) {
    if (fileName === LEGACY_PACK_FILENAME || fileName === CONTROL_FILENAME || fileName.startsWith(PACK_PREFIX)) {
      removed = installedPool.unlink(fileName) || removed;
    }
  }
  return { removed };
}

async function handleRequest(request: WorkerRequest): Promise<void> {
  try {
    let result: unknown;
    if (request.type === "init") result = await packInfo();
    else if (request.type === "install") result = await install(request.id, request.manifest);
    else if (request.type === "search") result = await search(request.query, request.limit);
    else result = await remove();
    post(request.id, "result", result);
  } catch (error) {
    post(request.id, "error", { message: safeMessage(error) });
  }
}

let requestQueue = Promise.resolve();
self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  requestQueue = requestQueue.then(() => handleRequest(request), () => handleRequest(request));
});

export {};
