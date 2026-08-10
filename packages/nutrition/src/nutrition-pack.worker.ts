/// <reference lib="webworker" />

import sqlite3InitModule, { type Database, type SAHPoolUtil } from "@sqlite.org/sqlite-wasm";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

const PACK_FILENAME = "/gym-local-nutrition.sqlite3";

type WorkerRequest =
  | { id: string; type: "init" }
  | { id: string; type: "install"; manifest: { downloadUrl: string; sizeBytes: number; sha256: string } }
  | { id: string; type: "search"; query: string; limit: number }
  | { id: string; type: "remove" };

let poolPromise: Promise<SAHPoolUtil> | undefined;
let database: Database | undefined;

function post(id: string, type: string, payload: unknown = undefined) {
  self.postMessage({ id, type, payload });
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function pool(): Promise<SAHPoolUtil> {
  if (!poolPromise) {
    poolPromise = sqlite3InitModule().then((sqlite3) => sqlite3.installOpfsSAHPoolVfs({
      initialCapacity: 4,
      directory: "/gym-local/nutrition",
      name: "gym-local-nutrition"
    }));
  }
  return poolPromise;
}

function closeDatabase(): void {
  database?.close();
  database = undefined;
}

async function openDatabase(): Promise<Database | undefined> {
  if (database) return database;
  const installedPool = await pool();
  if (!installedPool.getFileNames().includes(PACK_FILENAME)) return undefined;
  database = new installedPool.OpfsSAHPoolDb(PACK_FILENAME);
  database.exec("PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;");
  return database;
}

async function packInfo() {
  const installedPool = await pool();
  if (!installedPool.getFileNames().includes(PACK_FILENAME)) return { installed: false };
  try {
    const db = await openDatabase();
    if (!db) return { installed: false };
    const rows = db.exec({
      sql: "SELECT key, value FROM pack_meta",
      rowMode: "object",
      returnValue: "resultRows"
    });
    return {
      installed: true,
      metadata: Object.fromEntries(rows.map((row) => [String(row.key), String(row.value)]))
    };
  } catch {
    // A browser close during import can leave a partial SAH-pool file. The pack is
    // immutable and reproducible, so discard only that file and allow a clean retry.
    closeDatabase();
    installedPool.unlink(PACK_FILENAME);
    return { installed: false, recoveredInvalidPack: true };
  }
}

async function install(id: string, manifest: Extract<WorkerRequest, { type: "install" }>["manifest"]) {
  const response = await fetch(manifest.downloadUrl, { cache: "no-store" });
  if (!response.ok || !response.body) throw new Error(`Không tải được gói dinh dưỡng (${response.status})`);
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength && manifest.sizeBytes && declaredLength !== manifest.sizeBytes) throw new Error("Kích thước gói không khớp manifest");

  closeDatabase();
  const installedPool = await pool();
  const reader = response.body.getReader();
  const hasher = sha256.create();
  let downloaded = 0;
  try {
    const imported = await installedPool.importDb(PACK_FILENAME, async () => {
      const { done, value } = await reader.read();
      if (done) return undefined;
      downloaded += value.byteLength;
      hasher.update(value);
      post(id, "progress", { bytesDownloaded: downloaded, totalBytes: manifest.sizeBytes || declaredLength || undefined });
      return value;
    });
    if (manifest.sizeBytes && imported !== manifest.sizeBytes) throw new Error("Gói tải về chưa đủ dữ liệu");
    const checksum = bytesToHex(hasher.digest());
    if (checksum !== manifest.sha256.toLowerCase()) throw new Error("SHA-256 của gói dinh dưỡng không khớp");
    const info = await packInfo();
    return { ...info, checksum, bytesDownloaded: downloaded };
  } catch (error) {
    closeDatabase();
    installedPool.unlink(PACK_FILENAME);
    throw error;
  } finally {
    reader.releaseLock();
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

async function search(query: string, limit: number) {
  const db = await openDatabase();
  if (!db) throw new Error("Gói dinh dưỡng offline chưa được cài");
  const match = ftsQuery(query);
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
    bind: { $match: match, $limit: Math.min(50, Math.max(1, limit)) },
    rowMode: "object",
    returnValue: "resultRows"
  });
}

async function remove() {
  closeDatabase();
  const installedPool = await pool();
  return { removed: installedPool.unlink(PACK_FILENAME) };
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  void (async () => {
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
  })();
});

export {};
