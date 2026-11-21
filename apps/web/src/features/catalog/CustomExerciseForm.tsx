import { useState } from "react";
import { Button, Chip, Field, Notice } from "@gym/ui";
import type { EquipmentType, ExerciseVariant, LoadEntryMode, Movement, MuscleGroup, Profile } from "@gym/contracts";
import { EQUIPMENT_OPTIONS, type CustomExerciseInput } from "@gym/catalog";
import "./CustomExerciseForm.css";
import { muscleLabels } from "../../lib/exercise-visuals";

const muscles: MuscleGroup[] = ["chest", "back", "shoulders", "biceps", "triceps", "forearms", "quadriceps", "hamstrings", "glutes", "calves", "core", "full_body"];

const loadModes: { id: LoadEntryMode; vi: string; en: string }[] = [
  { id: "total_weight", vi: "Tạ × số lần (tổng mức tạ)", en: "Weight × reps (total load)" },
  { id: "per_hand", vi: "Tạ mỗi tay × số lần", en: "Weight per hand × reps" },
  { id: "per_side", vi: "Tạ mỗi bên × số lần", en: "Weight per side × reps" },
  { id: "bodyweight_plus", vi: "Trọng lượng cơ thể + tạ thêm", en: "Bodyweight + added load" },
  { id: "assisted", vi: "Có trợ lực", en: "Assisted" },
  { id: "reps_only", vi: "Chỉ số lần", en: "Reps only" },
  { id: "duration_distance", vi: "Thời gian / quãng đường", en: "Time / distance" }
];

interface CustomExerciseFormProps {
  locale: Profile["locale"];
  movement?: Movement;
  variant?: ExerciseVariant;
  onSave: (input: CustomExerciseInput) => Promise<void>;
  onCancel: () => void;
}

export function CustomExerciseForm({ locale, movement, variant, onSave, onCancel }: CustomExerciseFormProps) {
  const vi = locale === "vi";
  const [name, setName] = useState(movement?.name[locale] ?? "");
  const [primaryMuscle, setPrimaryMuscle] = useState<MuscleGroup>(movement?.primaryMuscles[0] ?? "chest");
  const [secondaryMuscles, setSecondaryMuscles] = useState<MuscleGroup[]>(movement?.secondaryMuscles ?? []);
  const [equipment, setEquipment] = useState<EquipmentType>(variant?.equipment[0] ?? "bodyweight");
  const [loadEntryMode, setLoadEntryMode] = useState<LoadEntryMode>(variant?.loadEntryMode ?? "total_weight");
  const [note, setNote] = useState(variant?.instructions[0]?.[locale] ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(undefined);
    try {
      await onSave({ name, primaryMuscle, secondaryMuscles, equipment, loadEntryMode, note });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setSaving(false);
    }
  };

  return (
    <form className="custom-exercise-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <Field label={vi ? "Tên bài tập" : "Exercise name"}>
        <input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder={vi ? "Ví dụ: Kéo cáp một tay ở phòng tập nhà" : "e.g. Single-arm cable pull at my gym"} />
      </Field>
      <div className="form-grid">
        <Field label={vi ? "Nhóm cơ chính" : "Primary muscle"}>
          <select value={primaryMuscle} onChange={(event) => { const next = event.target.value as MuscleGroup; setPrimaryMuscle(next); setSecondaryMuscles((current) => current.filter((item) => item !== next)); }}>
            {muscles.map((item) => <option key={item} value={item}>{muscleLabels[item][locale]}</option>)}
          </select>
        </Field>
        <Field label={vi ? "Dụng cụ" : "Equipment"}>
          <select value={equipment} onChange={(event) => setEquipment(event.target.value as EquipmentType)}>
            {EQUIPMENT_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.name[locale]}</option>)}
          </select>
        </Field>
      </div>
      <Field
        label={vi ? "Cách ghi set" : "How sets are logged"}
        hint={movement ? (vi ? "Đổi cách ghi không sửa các buổi đã lưu." : "Changing this does not rewrite saved workouts.") : undefined}
      >
        <select value={loadEntryMode} onChange={(event) => setLoadEntryMode(event.target.value as LoadEntryMode)}>
          {loadModes.map((mode) => <option key={mode.id} value={mode.id}>{mode[locale]}</option>)}
        </select>
      </Field>
      <div className="field">
        <span className="field__label">{vi ? "Nhóm cơ phụ (tùy chọn)" : "Secondary muscles (optional)"}</span>
        <div className="filter-scroll" role="group" aria-label={vi ? "Nhóm cơ phụ" : "Secondary muscles"}>
          {muscles.filter((item) => item !== primaryMuscle).map((item) => (
            <Chip key={item} active={secondaryMuscles.includes(item)} onClick={() => setSecondaryMuscles((current) => current.includes(item) ? current.filter((entry) => entry !== item) : [...current, item])}>{muscleLabels[item][locale]}</Chip>
          ))}
        </div>
      </div>
      <Field label={vi ? "Ghi chú cách tập (tùy chọn)" : "How-to note (optional)"}>
        <textarea rows={3} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      {error ? <Notice tone="warning">{error}</Notice> : null}
      <div className="modal-actions">
        <Button variant="ghost" onClick={onCancel}>{vi ? "Hủy" : "Cancel"}</Button>
        <Button type="submit" disabled={!name.trim() || saving}>{vi ? "Lưu bài tập" : "Save exercise"}</Button>
      </div>
    </form>
  );
}
