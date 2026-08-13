import { useEffect, useRef, useState } from "react";
import { ArchiveRestore, Check, ChevronRight, Download, Dumbbell, FileJson, FileSpreadsheet, HardDrive, Languages, LockKeyhole, MapPin, RefreshCw, Salad, Save, ShieldCheck, Upload, UserRound } from "lucide-react";
import { Button, Card, Field, Modal, Notice, SectionTitle } from "@gym/ui";
import { APP_VERSIONS, type EquipmentType, type Goal, type Profile } from "@gym/contracts";
import { CONTENT_SOURCES, EQUIPMENT_OPTIONS, EXERCISE_VARIANTS, MOVEMENTS } from "@gym/catalog";
import { createBackup, downloadBlob, readBackup, workoutCsv } from "@gym/backup";
import { confirmNutritionTarget, estimateNutritionTarget, nutritionTargetNeedsConfirmation, type NutritionEstimateInput } from "@gym/nutrition";
import { exportAllData, persistentStorageStatus, requestPersistentStorage, storageEstimate } from "@gym/storage";
import { formatDate, formatNumber } from "../../lib/i18n";
import { useGymStore } from "../../store/useGymStore";

const goalLabels: Record<Goal, { vi: string; en: string }> = {
  hypertrophy: { vi: "Tăng cơ", en: "Build muscle" }, strength: { vi: "Sức mạnh", en: "Strength" }, fat_loss: { vi: "Giảm mỡ", en: "Fat loss" }, general: { vi: "Sức khỏe chung", en: "General fitness" }
};

function optionalPositiveValue(raw: string, integer = false): number | undefined {
  const value = Number(raw.replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return integer ? Math.round(value) : value;
}

export function SettingsPage() {
  const storedProfile = useGymStore((state) => state.profile)!;
  const settings = useGymStore((state) => state.settings);
  const activeSession = useGymStore((state) => state.activeSession);
  const recoveryAvailable = useGymStore((state) => state.recoveryAvailable);
  const updateProfile = useGymStore((state) => state.updateProfile);
  const restore = useGymStore((state) => state.restore);
  const undoRestore = useGymStore((state) => state.undoRestore);
  const markBackup = useGymStore((state) => state.markBackup);
  const locale = storedProfile.locale;
  const [profile, setProfile] = useState(storedProfile);
  const [saved, setSaved] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState<{ text: string; tone: "success" | "warning" }>();
  const [profileMessage, setProfileMessage] = useState<{ text: string; tone: "success" | "warning" }>();
  const [usage, setUsage] = useState<{ usage?: number; quota?: number }>();
  const [persistent, setPersistent] = useState<boolean>();
  const [persistenceBusy, setPersistenceBusy] = useState(false);
  const [targetConfirmation, setTargetConfirmation] = useState<Profile>();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void storageEstimate().then((value) => value && setUsage({ usage: value.usage, quota: value.quota })).catch(() => setUsage(undefined));
    void persistentStorageStatus().then(setPersistent);
  }, []);

  const askForPersistentStorage = async () => {
    setPersistenceBusy(true);
    try {
      setPersistent(await requestPersistentStorage());
      setProfileMessage(undefined);
    } catch (error) {
      setProfileMessage({ text: error instanceof Error ? error.message : (locale === "vi" ? "Không thể yêu cầu lưu trữ bền vững." : "Could not request persistent storage."), tone: "warning" });
    } finally {
      setPersistenceBusy(false);
    }
  };

  const activeLocation = profile.locations.find((location) => location.id === profile.activeLocationId) ?? profile.locations[0];
  const setLocationEquipment = (equipment: EquipmentType) => {
    if (!activeLocation) return;
    setProfile((current) => ({ ...current, locations: current.locations.map((location) => location.id === activeLocation.id ? { ...location, equipment: location.equipment.includes(equipment) ? location.equipment.filter((item) => item !== equipment) : [...location.equipment, equipment] } : location) }));
  };

  const persistProfile = async (updated: Profile) => {
    try {
      await updateProfile(updated);
      setProfile(updated);
      setProfileMessage(undefined);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (error) {
      setProfileMessage({ text: error instanceof Error ? error.message : (locale === "vi" ? "Không thể lưu thay đổi." : "Could not save changes."), tone: "warning" });
      throw error;
    }
  };

  const saveAll = async () => {
    let nutritionTarget = profile.nutritionTarget;
    const hasAnyNutritionInput = Boolean(profile.age || profile.heightCm || profile.weightKg || (profile.biologicalSex && profile.biologicalSex !== "unspecified"));
    const nutritionFieldsChanged = profile.age !== storedProfile.age
      || profile.heightCm !== storedProfile.heightCm
      || profile.weightKg !== storedProfile.weightKg
      || profile.biologicalSex !== storedProfile.biologicalSex
      || profile.activityFactor !== storedProfile.activityFactor
      || profile.goal !== storedProfile.goal;
    const hasCompleteNutritionInput = (profile.biologicalSex === "female" || profile.biologicalSex === "male") && Boolean(profile.age && profile.heightCm && profile.weightKg && profile.activityFactor);
    const estimateInput: NutritionEstimateInput | undefined = hasCompleteNutritionInput ? {
      biologicalSex: profile.biologicalSex as "female" | "male",
      age: profile.age!,
      heightCm: profile.heightCm!,
      weightKg: profile.weightKg!,
      activityFactor: profile.activityFactor!,
      goal: profile.goal
    } : undefined;
    const targetNeedsConfirmation = nutritionTargetNeedsConfirmation(profile.nutritionTarget, estimateInput);
    if (estimateInput && targetNeedsConfirmation) {
      try {
        nutritionTarget = estimateNutritionTarget(estimateInput);
      } catch {
        setProfileMessage({ text: locale === "vi" ? "Tuổi phải từ 18–100, chiều cao 120–230 cm và cân nặng 35–350 kg." : "Age must be 18–100, height 120–230 cm, and weight 35–350 kg.", tone: "warning" });
        return;
      }
    } else if (hasAnyNutritionInput && nutritionFieldsChanged) {
      setProfileMessage({ text: locale === "vi" ? "Hãy nhập đủ tuổi, giới tính sinh học, chiều cao và cân nặng để cập nhật mục tiêu; mục tiêu cũ chưa được thay đổi." : "Enter age, biological sex, height and weight to update the target; the previous target has not been changed.", tone: "warning" });
      return;
    } else if (!hasAnyNutritionInput && nutritionFieldsChanged) {
      nutritionTarget = undefined;
    }
    const updated: Profile = { ...profile, nutritionTarget, updatedAt: new Date().toISOString() };
    if (nutritionTarget && estimateInput && targetNeedsConfirmation) {
      setTargetConfirmation(updated);
      return;
    }
    await persistProfile(updated).catch(() => undefined);
  };

  const confirmTargetAndSave = async () => {
    if (!targetConfirmation?.nutritionTarget) return;
    const confirmed: Profile = {
      ...targetConfirmation,
      nutritionTarget: confirmNutritionTarget(targetConfirmation.nutritionTarget),
      updatedAt: new Date().toISOString()
    };
    await persistProfile(confirmed).then(() => setTargetConfirmation(undefined)).catch(() => undefined);
  };

  const exportBackup = async () => {
    setBackupBusy(true);
    setBackupMessage(undefined);
    try {
      const data = await exportAllData();
      const blob = await createBackup(data);
      downloadBlob(blob, `gym-local-backup-${new Date().toISOString().slice(0, 10)}.zip`);
      await markBackup();
      setBackupMessage({ text: locale === "vi" ? "Đã tạo bản backup. Hãy giữ file ở nơi an toàn." : "Backup created. Keep the file somewhere safe.", tone: "success" });
    } catch (error) {
      setBackupMessage({ text: error instanceof Error ? error.message : "Backup failed", tone: "warning" });
    } finally {
      setBackupBusy(false);
    }
  };

  const exportCsv = async () => {
    try {
      const data = await exportAllData();
      downloadBlob(new Blob([workoutCsv(data)], { type: "text/csv;charset=utf-8" }), `gym-local-workouts-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (error) {
      setBackupMessage({ text: error instanceof Error ? error.message : "CSV export failed", tone: "warning" });
    }
  };

  const importBackup = async (file: File) => {
    setBackupBusy(true);
    setBackupMessage(undefined);
    try {
      const backup = await readBackup(file);
      const approved = window.confirm(locale === "vi" ? "Khôi phục sẽ thay thế toàn bộ dữ liệu đang có trên thiết bị này. Tiếp tục?" : "Restore will replace all current data on this device. Continue?");
      if (!approved) return;
      await restore(backup.data);
      if (backup.data.profile) setProfile(backup.data.profile);
      setBackupMessage({ text: locale === "vi" ? `Đã khôi phục bản ngày ${formatDate(backup.manifest.exportedAt, locale)}.` : `Restored backup from ${formatDate(backup.manifest.exportedAt, locale)}.`, tone: "success" });
    } catch (error) {
      setBackupMessage({ text: error instanceof Error ? error.message : "Restore failed", tone: "warning" });
    } finally {
      setBackupBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const undoBackupRestore = async () => {
    setBackupBusy(true);
    setBackupMessage(undefined);
    try {
      const restored = await undoRestore();
      const recoveredProfile = useGymStore.getState().profile;
      if (restored && recoveredProfile) setProfile(recoveredProfile);
      setBackupMessage({
        text: restored
          ? (locale === "vi" ? "Đã hoàn tác và khôi phục dữ liệu trước lần nhập backup." : "Restored the data from before the backup import.")
          : (locale === "vi" ? "Không còn điểm khôi phục để hoàn tác." : "No restore point is available."),
        tone: restored ? "success" : "warning"
      });
    } catch (error) {
      setBackupMessage({ text: error instanceof Error ? error.message : "Undo restore failed", tone: "warning" });
    } finally {
      setBackupBusy(false);
    }
  };

  return (
    <div className="page settings-page">
      <header className="page-header"><div><span className="eyebrow">{locale === "vi" ? "Kiểm soát hoàn toàn" : "Full control"}</span><h1>{locale === "vi" ? "Cài đặt" : "Settings"}</h1><p>{locale === "vi" ? "Không tài khoản, không máy chủ, không đăng ký trả phí." : "No account, no server, no subscription."}</p></div><Button onClick={() => void saveAll()}>{saved ? <Check size={18} /> : <Save size={18} />}{saved ? (locale === "vi" ? "Đã lưu" : "Saved") : (locale === "vi" ? "Lưu thay đổi" : "Save changes")}</Button></header>

      {profileMessage ? <Notice tone={profileMessage.tone}>{profileMessage.text}</Notice> : null}
      <div className="settings-layout">
        <div className="settings-main">
          <section>
            <SectionTitle eyebrow={locale === "vi" ? "Cá nhân hóa" : "Personalize"} title={locale === "vi" ? "Hồ sơ" : "Profile"} />
            <Card className="settings-card">
              <div className="settings-card__heading"><span><UserRound size={20} /></span><div><h3>{locale === "vi" ? "Thông tin cơ bản" : "Basic details"}</h3><p>{locale === "vi" ? "Dùng để hiển thị và tính mục tiêu khởi đầu." : "Used for display and starting estimates."}</p></div></div>
              <div className="form-grid"><Field label={locale === "vi" ? "Tên hiển thị" : "Display name"}><input value={profile.displayName} onChange={(event) => setProfile((value) => ({ ...value, displayName: event.target.value }))} /></Field><Field label={locale === "vi" ? "Mục tiêu" : "Goal"}><select value={profile.goal} onChange={(event) => setProfile((value) => ({ ...value, goal: event.target.value as Goal }))}>{Object.entries(goalLabels).map(([id, label]) => <option value={id} key={id}>{label[locale]}</option>)}</select></Field><Field label={locale === "vi" ? "Số buổi / tuần" : "Days / week"}><input type="number" min="1" max="7" value={profile.daysPerWeek} onChange={(event) => setProfile((value) => ({ ...value, daysPerWeek: Math.min(7, Math.max(1, Number(event.target.value) || 1)) }))} /></Field><Field label={locale === "vi" ? "Đơn vị" : "Units"}><input value="kg · cm" disabled aria-describedby="metric-note" /><small id="metric-note">{locale === "vi" ? "Phiên bản này lưu dữ liệu theo hệ mét để lịch sử luôn nhất quán." : "This version stores metric values so history stays consistent."}</small></Field></div>
              <div className="language-row"><span><Languages size={18} />{locale === "vi" ? "Ngôn ngữ giao diện" : "App language"}</span><div><button type="button" className={profile.locale === "vi" ? "active" : ""} onClick={() => setProfile((value) => ({ ...value, locale: "vi" }))}>Tiếng Việt</button><button type="button" className={profile.locale === "en" ? "active" : ""} onClick={() => setProfile((value) => ({ ...value, locale: "en" }))}>English</button></div></div>
            </Card>
          </section>

          <section>
            <SectionTitle eyebrow={locale === "vi" ? "Ưu tiên biến thể" : "Variation priority"} title={locale === "vi" ? "Địa điểm & dụng cụ" : "Location & equipment"} />
            <Card className="settings-card">
              <div className="settings-card__heading"><span><MapPin size={20} /></span><div><h3>{activeLocation?.name ?? "My gym"}</h3><p>{locale === "vi" ? "Các biến thể dùng đủ dụng cụ sẽ được xếp lên trước." : "Variations supported by your equipment are ranked first."}</p></div></div>
              <div className="equipment-grid equipment-grid--settings">{EQUIPMENT_OPTIONS.map((option) => { const active = activeLocation?.equipment.includes(option.id); return <button type="button" key={option.id} className={active ? "equipment-option equipment-option--active" : "equipment-option"} onClick={() => setLocationEquipment(option.id)}><span className="equipment-option__check">{active ? <Check size={14} /> : null}</span><span>{option.name[locale]}</span></button>; })}</div>
            </Card>
          </section>

          <section>
            <SectionTitle eyebrow={locale === "vi" ? "Ước tính có thể chỉnh" : "Editable estimate"} title={locale === "vi" ? "Calories & macro" : "Calories & macros"} />
            <Card className="settings-card">
              <div className="settings-card__heading"><span><Salad size={20} /></span><div><h3>{locale === "vi" ? "Thông tin cơ thể" : "Body details"}</h3><p>{locale === "vi" ? "Khi lưu, app tính lại bằng công thức Mifflin–St Jeor." : "Saving recalculates with the Mifflin–St Jeor formula."}</p></div></div>
              <div className="form-grid form-grid--3"><Field label={locale === "vi" ? "Tuổi" : "Age"}><input type="number" inputMode="numeric" min="18" max="100" value={profile.age ?? ""} onChange={(event) => setProfile((value) => ({ ...value, age: optionalPositiveValue(event.target.value, true) }))} /></Field><Field label={locale === "vi" ? "Giới tính sinh học" : "Biological sex"}><select value={profile.biologicalSex ?? "unspecified"} onChange={(event) => setProfile((value) => ({ ...value, biologicalSex: event.target.value as Profile["biologicalSex"] }))}><option value="unspecified">—</option><option value="female">{locale === "vi" ? "Nữ" : "Female"}</option><option value="male">{locale === "vi" ? "Nam" : "Male"}</option></select></Field><Field label={locale === "vi" ? "Chiều cao (cm)" : "Height (cm)"}><input type="number" inputMode="decimal" min="1" step="0.1" value={profile.heightCm ?? ""} onChange={(event) => setProfile((value) => ({ ...value, heightCm: optionalPositiveValue(event.target.value) }))} /></Field><Field label={locale === "vi" ? "Cân nặng (kg)" : "Weight (kg)"}><input type="number" inputMode="decimal" min="1" step="0.1" value={profile.weightKg ?? ""} onChange={(event) => setProfile((value) => ({ ...value, weightKg: optionalPositiveValue(event.target.value) }))} /></Field><Field label={locale === "vi" ? "Hoạt động" : "Activity"}><select value={profile.activityFactor ?? 1.55} onChange={(event) => setProfile((value) => ({ ...value, activityFactor: Number(event.target.value) as Profile["activityFactor"] }))}><option value="1.2">1.2 · {locale === "vi" ? "Ít" : "Sedentary"}</option><option value="1.375">1.375 · {locale === "vi" ? "Nhẹ" : "Light"}</option><option value="1.55">1.55 · {locale === "vi" ? "Vừa" : "Moderate"}</option><option value="1.725">1.725 · {locale === "vi" ? "Cao" : "High"}</option><option value="1.9">1.9 · {locale === "vi" ? "Rất cao" : "Very high"}</option></select></Field></div>
              {profile.nutritionTarget ? <><div className="target-summary"><div><strong>{profile.nutritionTarget.calories}</strong><span>kcal</span></div><div><strong>{profile.nutritionTarget.protein}g</strong><span>protein</span></div><div><strong>{profile.nutritionTarget.carbs}g</strong><span>carbs</span></div><div><strong>{profile.nutritionTarget.fat}g</strong><span>fat</span></div><div><strong>{profile.nutritionTarget.waterMl}ml</strong><span>{locale === "vi" ? "nước" : "water"}</span></div></div><p className="fine-print">{profile.nutritionTarget.basis && profile.nutritionTarget.calculatedAt
                ? (locale === "vi"
                  ? `Công thức Mifflin–St Jeor v${profile.nutritionTarget.formulaVersion} · tính ${formatDate(profile.nutritionTarget.calculatedAt, locale)} · ${profile.nutritionTarget.basis.biologicalSex === "female" ? "nữ" : "nam"}, ${profile.nutritionTarget.basis.weightKg} kg, ${profile.nutritionTarget.basis.heightCm} cm, ${profile.nutritionTarget.basis.age} tuổi, hệ số hoạt động ${profile.nutritionTarget.basis.activityFactor}, mục tiêu ${goalLabels[profile.nutritionTarget.basis.goal][locale].toLowerCase()}.`
                  : `Mifflin–St Jeor formula v${profile.nutritionTarget.formulaVersion} · calculated ${formatDate(profile.nutritionTarget.calculatedAt, locale)} · ${profile.nutritionTarget.basis.biologicalSex}, ${profile.nutritionTarget.basis.weightKg} kg, ${profile.nutritionTarget.basis.heightCm} cm, age ${profile.nutritionTarget.basis.age}, activity factor ${profile.nutritionTarget.basis.activityFactor}, goal ${goalLabels[profile.nutritionTarget.basis.goal][locale].toLowerCase()}.`)
                : (locale === "vi" ? "Mục tiêu cũ chưa có đủ thông tin nguồn tính; lưu lại để xem và xác nhận bản ước tính mới." : "This legacy target has no complete calculation provenance; save again to review and confirm a new estimate.")}</p></> : null}
              <p className="fine-print">{locale === "vi" ? "Ước tính chỉ là điểm bắt đầu, không thay thế chẩn đoán hay tư vấn của chuyên gia." : "Estimates are only a starting point and do not replace professional advice."}</p>
            </Card>
          </section>

          <section>
            <SectionTitle eyebrow={locale === "vi" ? "Bạn giữ file" : "You keep the file"} title={locale === "vi" ? "Backup & khôi phục" : "Backup & restore"} />
            <Card className="settings-card backup-card">
              <div className="settings-card__heading"><span><ArchiveRestore size={20} /></span><div><h3>{locale === "vi" ? "Backup thủ công" : "Manual backup"}</h3><p>{locale === "vi" ? "File ZIP có checksum, bao gồm hồ sơ, lịch, buổi tập, dinh dưỡng và số đo." : "A checksummed ZIP containing profile, routines, workouts, nutrition, and measurements."}</p></div></div>
              {activeSession ? <Notice tone="warning">{locale === "vi" ? "Bạn đang tập. Hãy kết thúc buổi trước khi khôi phục để tránh mất các set đang nhập." : "A workout is active. Finish it before restoring to avoid losing in-progress sets."}</Notice> : null}
              <div className="backup-actions">
                <button type="button" onClick={() => void exportBackup()} disabled={backupBusy}><span><FileJson size={22} /></span><div><strong>{locale === "vi" ? "Tải backup ZIP" : "Download ZIP backup"}</strong><small>{settings.lastBackupAt ? `${locale === "vi" ? "Lần cuối" : "Last"}: ${formatDate(settings.lastBackupAt, locale, { day: "numeric", month: "short", year: "numeric" })}` : (locale === "vi" ? "Chưa backup" : "No backup yet")}</small></div><Download size={18} /></button>
                <button type="button" onClick={() => fileRef.current?.click()} disabled={backupBusy || Boolean(activeSession)}><span><Upload size={22} /></span><div><strong>{locale === "vi" ? "Khôi phục từ ZIP" : "Restore from ZIP"}</strong><small>{locale === "vi" ? "Kiểm tra file trước khi thay thế" : "Validated before replacing data"}</small></div><ChevronRight size={18} /></button>
                {recoveryAvailable ? <button type="button" onClick={() => void undoBackupRestore()} disabled={backupBusy || Boolean(activeSession)}><span><RefreshCw size={22} /></span><div><strong>{locale === "vi" ? "Hoàn tác khôi phục" : "Undo last restore"}</strong><small>{locale === "vi" ? "Lấy lại dữ liệu trước lần nhập ZIP gần nhất" : "Recover data from before the latest ZIP import"}</small></div><ChevronRight size={18} /></button> : null}
                <button type="button" onClick={() => void exportCsv()}><span><FileSpreadsheet size={22} /></span><div><strong>{locale === "vi" ? "Xuất lịch sử CSV" : "Export workout CSV"}</strong><small>{locale === "vi" ? "Mở được bằng Excel / Sheets" : "Works with Excel / Sheets"}</small></div><Download size={18} /></button>
              </div>
              <input ref={fileRef} type="file" accept=".zip,application/zip" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackup(file); }} />
              {backupMessage ? <Notice tone={backupMessage.tone}>{backupMessage.text}</Notice> : null}
            </Card>
          </section>
        </div>

        <aside className="settings-aside">
          <Card className="privacy-card"><span><LockKeyhole size={28} /></span><h3>{locale === "vi" ? "Local-first" : "Local-first"}</h3><p>{locale === "vi" ? "Dữ liệu cá nhân nằm trong IndexedDB của trình duyệt. Không có tài khoản hoặc đồng bộ cloud." : "Personal data lives in browser IndexedDB. There is no account or cloud sync."}</p><div><ShieldCheck size={16} />{locale === "vi" ? "Không gửi dữ liệu tập luyện" : "No workout data upload"}</div><div><HardDrive size={16} />{locale === "vi" ? "Bạn tự giữ backup" : "You own the backup"}</div></Card>
          <Card className="storage-card"><span className="eyebrow">{locale === "vi" ? "Dung lượng cục bộ" : "Local storage"}</span><strong>{usage?.usage ? formatNumber(usage.usage / 1024 / 1024, locale) : "—"} MB</strong><p>{usage?.quota ? `${locale === "vi" ? "Giới hạn ước tính" : "Estimated quota"}: ${formatNumber(usage.quota / 1024 / 1024, locale, 0)} MB` : (locale === "vi" ? "Do trình duyệt quản lý" : "Managed by your browser")}</p><Button size="sm" variant="secondary" disabled={persistenceBusy || persistent === true} onClick={() => void askForPersistentStorage()}>{persistent ? <Check size={15} /> : <HardDrive size={15} />}{persistent ? (locale === "vi" ? "Đã chống tự xóa" : "Persistent enabled") : (locale === "vi" ? "Cho phép lưu bền vững" : "Allow persistent storage")}</Button><small>{locale === "vi" ? "Chỉ yêu cầu sau khi bạn bấm nút này." : "Requested only after you press this button."}</small></Card>
          <Card className="version-card"><div className="settings-card__heading"><span><RefreshCw size={19} /></span><div><h3>Gym Local v{APP_VERSIONS.app}</h3><p>{locale === "vi" ? "PWA cập nhật có kiểm soát" : "Controlled PWA updates"}</p></div></div><ul><li><span>Database schema</span><strong>v{APP_VERSIONS.database}</strong></li><li><span>Exercise catalog</span><strong>v{APP_VERSIONS.catalog}</strong></li><li><span>Routine templates</span><strong>v{APP_VERSIONS.routines}</strong></li><li><span>Backup format</span><strong>v{APP_VERSIONS.backup}</strong></li></ul><Notice>{locale === "vi" ? "Bản mới sẽ chờ nếu bạn đang trong một buổi tập." : "New versions wait while a workout is active."}</Notice></Card>
          <Card className="content-card"><div className="settings-card__heading"><span><Dumbbell size={19} /></span><div><h3>{locale === "vi" ? "Nội dung bài tập" : "Exercise content"}</h3><p>{locale === "vi" ? "Có version và nguồn để Codex kiểm tra lại." : "Versioned and sourced for Codex review."}</p></div></div><ul><li><span>{locale === "vi" ? "Nhóm động tác" : "Movements"}</span><strong>{MOVEMENTS.length}</strong></li><li><span>{locale === "vi" ? "Biến thể dụng cụ" : "Equipment variations"}</span><strong>{EXERCISE_VARIANTS.length}</strong></li><li><span>{locale === "vi" ? "Nguồn khai báo" : "Declared sources"}</span><strong>{CONTENT_SOURCES.length}</strong></li></ul></Card>
        </aside>
      </div>

      <Modal open={Boolean(targetConfirmation)} title={locale === "vi" ? "Xác nhận mục tiêu dinh dưỡng" : "Confirm nutrition targets"} onClose={() => setTargetConfirmation(undefined)}>
        {targetConfirmation?.nutritionTarget ? <div className="metric-form">
          <Notice tone="warning">{locale === "vi" ? "Thông tin cơ thể đã thay đổi. Hãy kiểm tra bản ước tính trước khi dùng làm mục tiêu mới." : "Your body details changed. Review this estimate before using it as your new target."}</Notice>
          <div className="target-summary"><div><strong>{targetConfirmation.nutritionTarget.calories}</strong><span>kcal</span></div><div><strong>{targetConfirmation.nutritionTarget.protein}g</strong><span>protein</span></div><div><strong>{targetConfirmation.nutritionTarget.carbs}g</strong><span>carbs</span></div><div><strong>{targetConfirmation.nutritionTarget.fat}g</strong><span>fat</span></div><div><strong>{targetConfirmation.nutritionTarget.waterMl}ml</strong><span>{locale === "vi" ? "nước" : "water"}</span></div></div>
          {targetConfirmation.nutritionTarget.basis ? <p className="fine-print">{locale === "vi"
            ? `Đầu vào: ${targetConfirmation.nutritionTarget.basis.biologicalSex === "female" ? "nữ" : "nam"} · ${targetConfirmation.nutritionTarget.basis.weightKg} kg · ${targetConfirmation.nutritionTarget.basis.heightCm} cm · ${targetConfirmation.nutritionTarget.basis.age} tuổi · hệ số hoạt động ${targetConfirmation.nutritionTarget.basis.activityFactor} · mục tiêu ${goalLabels[targetConfirmation.nutritionTarget.basis.goal][locale].toLowerCase()}. Đây chỉ là điểm khởi đầu, không phải tư vấn y tế.`
            : `Inputs: ${targetConfirmation.nutritionTarget.basis.biologicalSex} · ${targetConfirmation.nutritionTarget.basis.weightKg} kg · ${targetConfirmation.nutritionTarget.basis.heightCm} cm · age ${targetConfirmation.nutritionTarget.basis.age} · activity factor ${targetConfirmation.nutritionTarget.basis.activityFactor} · goal ${goalLabels[targetConfirmation.nutritionTarget.basis.goal][locale].toLowerCase()}. This is a starting point, not medical advice.`}</p> : null}
          <div className="modal-actions"><Button variant="ghost" onClick={() => setTargetConfirmation(undefined)}>{locale === "vi" ? "Xem lại" : "Review again"}</Button><Button onClick={() => void confirmTargetAndSave()}>{locale === "vi" ? "Xác nhận & lưu" : "Confirm & save"}</Button></div>
        </div> : null}
      </Modal>
    </div>
  );
}
