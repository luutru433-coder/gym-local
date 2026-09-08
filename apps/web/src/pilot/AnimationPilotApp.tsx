/*
 * Copyright (c) 2026 Gym Local contributors
 * SPDX-License-Identifier: MIT
 */

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { ANIMATION_CATALOG, EXERCISE_VARIANTS } from "@gym/catalog";
import { createAnimationPlayerController, createGltfAnimationRenderer } from "@gym/media";
import {
  getAnimationPackStatus,
  installAnimationPack,
  readExactAnimationSource,
  removeAnimationPack,
  rollbackAnimationPack,
  type AnimationPackStoreStatus
} from "@gym/storage";
import { ExerciseAnimationPlayer } from "../components/ExerciseAnimationPlayer";
import "./animation-pilot.css";

const PACK_ID = "gym-local.animation-pilot-01";

function statusLabel(status: AnimationPackStoreStatus): string {
  if (status.state === "unavailable") return status.error ? `unavailable:${status.error.code}` : "unavailable";
  return `active:${status.active.version}${status.previous ? ` previous:${status.previous.version}` : ""}`;
}

export function AnimationPilotApp() {
  const [status, setStatus] = useState<AnimationPackStoreStatus>({ state: "unavailable", warnings: [] });
  const [descriptorFile, setDescriptorFile] = useState<File>();
  const [archiveFile, setArchiveFile] = useState<File>();
  const [selectedId, setSelectedId] = useState(ANIMATION_CATALOG[0].exerciseVariantId);
  const [message, setMessage] = useState("Sẵn sàng / Ready");
  const record = ANIMATION_CATALOG.find((candidate) => candidate.exerciseVariantId === selectedId) ?? ANIMATION_CATALOG[0];
  const variant = EXERCISE_VARIANTS.find((candidate) => candidate.id === record.exerciseVariantId);

  useEffect(() => { void getAnimationPackStatus().then(setStatus).catch(() => setStatus({ state: "unavailable", warnings: [] })); }, []);

  const controller = useMemo(() => createAnimationPlayerController({
    loader: {
      async load(request, signal) {
        if (status.state !== "available") throw { code: "missing_variant" };
        return readExactAnimationSource({
          packId: PACK_ID,
          version: status.active.version,
          exerciseVariantId: request.exerciseVariantId,
          animationId: request.animationId,
          signal
        });
      }
    },
    renderer: createGltfAnimationRenderer()
  }), [status]);

  useEffect(() => () => controller.dispose(), [controller]);

  const run = async (label: string, operation: () => Promise<AnimationPackStoreStatus>) => {
    setMessage(`${label}…`);
    try {
      const next = await operation();
      setStatus(next);
      setMessage(`${label}: OK`);
    } catch (error) {
      const code = typeof error === "object" && error !== null && "error" in error
        ? (error as { error?: { code?: string } }).error?.code
        : undefined;
      setMessage(`${label}: ${code ?? "failed"}`);
    }
  };

  const file = (setter: (value: File | undefined) => void) => (event: ChangeEvent<HTMLInputElement>) => setter(event.currentTarget.files?.[0]);
  const install = () => run("Install/update", async () => {
    if (!descriptorFile || !archiveFile) throw new Error("local files required");
    return installAnimationPack(await descriptorFile.text(), archiveFile);
  });
  const writtenFallback = variant?.instructions.map((instruction) => instruction.en).join(" ") ?? "Use the written exercise guidance.";

  return (
    <main className="animation-pilot" data-testid="animation-pilot-app">
      <header>
        <p className="animation-pilot__eyebrow">ANIMATION-PILOT-01-REV-02</p>
        <h1>Thử nghiệm hoạt ảnh offline / Offline animation pilot</h1>
        <p>Chỉ đọc descriptor và ZIP bạn chọn trên thiết bị. Không có tải mạng tự động.</p>
      </header>

      <section className="animation-pilot__panel" aria-labelledby="pilot-install-title">
        <h2 id="pilot-install-title">Gói cục bộ / Local pack</h2>
        <label>Release descriptor JSON<input type="file" accept="application/json,.json" onChange={file(setDescriptorFile)} /></label>
        <label>Animation pack ZIP<input type="file" accept="application/zip,.zip" onChange={file(setArchiveFile)} /></label>
        <div className="animation-pilot__actions">
          <button type="button" disabled={!descriptorFile || !archiveFile} onClick={() => void install()}>Install / Update</button>
          <button type="button" disabled={status.state !== "available" || !status.previous} onClick={() => void run("Rollback", rollbackAnimationPack)}>Rollback</button>
          <button type="button" disabled={status.state !== "available"} onClick={() => void run("Remove", removeAnimationPack)}>Remove</button>
        </div>
        <output aria-live="polite" aria-atomic="true">{statusLabel(status)} · {message}</output>
      </section>

      <section className="animation-pilot__panel" aria-labelledby="pilot-player-title">
        <h2 id="pilot-player-title">12 ánh xạ chính xác / 12 exact mappings</h2>
        <label htmlFor="pilot-variant">Exercise variant</label>
        <select id="pilot-variant" value={selectedId} onChange={(event) => setSelectedId(event.currentTarget.value)}>
          {ANIMATION_CATALOG.map((candidate) => <option key={candidate.exerciseVariantId} value={candidate.exerciseVariantId}>{candidate.exerciseVariantId}</option>)}
        </select>
        <ExerciseAnimationPlayer
          controller={controller}
          request={{ exerciseVariantId: record.exerciseVariantId, animationId: record.animationId, playbackSpeed: 1, cameraPreset: record.cameraPreset, mirrorMode: "none", reducedMotion: false }}
          locale="vi"
          exerciseName={variant?.name ?? { vi: record.exerciseVariantId, en: record.exerciseVariantId }}
          writtenFallback={{ vi: variant?.instructions.map((instruction) => instruction.vi).join(" ") ?? "Dùng hướng dẫn bằng chữ.", en: writtenFallback }}
        />
      </section>
    </main>
  );
}
