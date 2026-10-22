/*
 * Copyright (c) 2026 MyCompany LLC
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and limitations under the License.
 */

import { useEffect, useState } from "react";
import { Button, Card, Notice } from "@gym/ui";
import { EXERCISE_VARIANTS } from "@gym/catalog";
import {
  activatePersonalLocalAnimation,
  importPersonalLocalAnimation,
  listPersonalLocalAnimations,
  removePersonalLocalAnimation,
  type PersonalLocalAnimationListItem
} from "@gym/storage";
import type { PersonalLocalAnimationOrigin } from "@gym/contracts";
import "./PersonalLocalAnimationCard.css";

export function PersonalLocalAnimationCard({ locale }: { locale: "vi" | "en" }) {
  const [file, setFile] = useState<File>();
  const [variantId, setVariantId] = useState("");
  const [origin, setOrigin] = useState<PersonalLocalAnimationOrigin>();
  const [acknowledged, setAcknowledged] = useState(false);
  const [items, setItems] = useState<PersonalLocalAnimationListItem[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => setItems(await listPersonalLocalAnimations());
  useEffect(() => {
    void listPersonalLocalAnimations().then(setItems, () => setStatus(locale === "vi" ? "Không thể đọc hoạt ảnh trên thiết bị." : "Could not read device animations."));
  }, [locale]);

  const run = async (operation: () => Promise<PersonalLocalAnimationListItem[]>, success: string) => {
    setBusy(true);
    try { setItems(await operation()); setStatus(success); } catch (error) { setStatus(error instanceof Error ? error.message : (locale === "vi" ? "Thao tác thất bại." : "Operation failed.")); } finally { setBusy(false); }
  };

  const importFile = async () => {
    if (file === undefined || variantId === "" || origin === undefined || !acknowledged) return;
    setBusy(true);
    try {
      await importPersonalLocalAnimation({ file, exerciseVariantId: variantId, origin, localOnlyAcknowledged: true });
      await refresh(); setStatus(locale === "vi" ? "Đã nhập riêng trên thiết bị." : "Imported on this device only."); setFile(undefined);
    } catch (error) { setStatus(error instanceof Error ? error.message : (locale === "vi" ? "Không thể nhập file." : "Could not import file.")); } finally { setBusy(false); }
  };

  return <Card className="personal-local-animation-card">
    <h3>{locale === "vi" ? "Hoạt ảnh cá nhân trên thiết bị" : "Personal device animation"}</h3>
    <p>{locale === "vi" ? "File GLB chưa được Gym Local kiểm duyệt. File chỉ ở thiết bị này, không nằm trong backup hoặc chuyển dữ liệu, và không bao giờ đủ điều kiện phân phối." : "This GLB is not reviewed by Gym Local. It stays on this device, is absent from backup and transfer, and never becomes eligible for distribution."}</p>
    <p className="personal-local-animation-card__fallback">{locale === "vi" ? "Hướng dẫn bằng chữ luôn khả dụng; chế độ giảm chuyển động không tự phát hoạt ảnh." : "Written instructions always remain available; reduced-motion mode never autoplays animation."}</p>
    <label>{locale === "vi" ? "File GLB" : "GLB file"}<input aria-label={locale === "vi" ? "File GLB" : "GLB file"} type="file" accept=".glb,model/gltf-binary" onChange={(event) => setFile(event.target.files?.[0])} /></label>
    <label>{locale === "vi" ? "Biến thể bài tập chính xác" : "Exact exercise variant"}<select aria-label={locale === "vi" ? "Biến thể bài tập chính xác" : "Exact exercise variant"} value={variantId} onChange={(event) => setVariantId(event.target.value)}><option value="">—</option>{EXERCISE_VARIANTS.map((variant) => <option key={variant.id} value={variant.id}>{variant.name[locale]} · {variant.id}</option>)}</select></label>
    <fieldset><legend>{locale === "vi" ? "Nguồn file" : "File origin"}</legend><label><input type="radio" name="personal-origin" checked={origin === "user_supplied"} onChange={() => setOrigin("user_supplied")} />{locale === "vi" ? "File của tôi" : "My own file"}</label><label><input type="radio" name="personal-origin" checked={origin === "permissively_sourced"} onChange={() => setOrigin("permissively_sourced")} />{locale === "vi" ? "Nguồn cho phép sử dụng" : "Permissively sourced"}</label></fieldset>
    <label><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />{locale === "vi" ? "Tôi hiểu đây là file cục bộ, chưa được kiểm duyệt và không được phân phối." : "I understand this is unreviewed local-only material and is not distributable."}</label>
    <Button disabled={busy || file === undefined || variantId === "" || origin === undefined || !acknowledged} onClick={() => void importFile()}>{locale === "vi" ? "Nhập trên thiết bị" : "Import on device"}</Button>
    <div role="status" aria-live="polite" aria-atomic="true">{status ? <Notice>{status}</Notice> : null}</div>
    <ul>{items.map(({ record, active }) => <li key={record.personalLocalAnimationId}><div><strong>{record.clipName}</strong><small>{record.exerciseVariantId} · {record.personalLocalAnimationId}</small></div><div><Button size="sm" variant="secondary" disabled={busy || active} onClick={() => void run(() => activatePersonalLocalAnimation(record.personalLocalAnimationId, record.exerciseVariantId), locale === "vi" ? "Đã kích hoạt bản xem trước." : "Preview activated.")}>{active ? (locale === "vi" ? "Đang xem trước" : "Preview active") : (locale === "vi" ? "Xem trước" : "Preview")}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => removePersonalLocalAnimation(record.personalLocalAnimationId, record.exerciseVariantId), locale === "vi" ? "Đã xóa khỏi thiết bị." : "Removed from device.")}>{locale === "vi" ? "Xóa" : "Remove"}</Button></div></li>)}</ul>
  </Card>;
}
