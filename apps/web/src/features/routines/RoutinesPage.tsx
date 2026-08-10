import { useMemo, useState } from "react";
import { Check, ChevronRight, Clock3, CopyPlus, Dumbbell, Layers3, Play, Plus, Search, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button, Card, EmptyState, Field, Modal, SectionTitle } from "@gym/ui";
import { createId, type Goal, type Routine, type RoutineItem } from "@gym/contracts";
import { getVariantsForMovement, MOVEMENTS, rankVariantsForEquipment } from "@gym/catalog";
import { ROUTINE_TEMPLATES } from "@gym/workouts";
import { localize } from "../../lib/i18n";
import { useGymStore } from "../../store/useGymStore";

const goalLabels: Record<Goal, { vi: string; en: string }> = {
  hypertrophy: { vi: "Tăng cơ", en: "Hypertrophy" },
  strength: { vi: "Sức mạnh", en: "Strength" },
  fat_loss: { vi: "Giảm mỡ", en: "Fat loss" },
  general: { vi: "Tổng quát", en: "General" }
};

export function RoutinesPage() {
  const navigate = useNavigate();
  const profile = useGymStore((state) => state.profile)!;
  const routines = useGymStore((state) => state.routines);
  const activeSession = useGymStore((state) => state.activeSession);
  const installTemplate = useGymStore((state) => state.installTemplate);
  const saveUserRoutine = useGymStore((state) => state.saveUserRoutine);
  const removeRoutine = useGymStore((state) => state.removeRoutine);
  const startWorkout = useGymStore((state) => state.startWorkout);
  const locale = profile.locale;
  const [detail, setDetail] = useState<Routine>();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderName, setBuilderName] = useState("");
  const [builderGoal, setBuilderGoal] = useState<Goal>(profile.goal);
  const [selectedMovements, setSelectedMovements] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const installedTemplates = new Set(routines.map((routine) => routine.sourceTemplateId));
  const availableEquipment = profile.locations.find((location) => location.id === profile.activeLocationId)?.equipment ?? [];
  const movementResults = useMemo(() => MOVEMENTS.filter((movement) => {
    const term = search.trim().toLocaleLowerCase(locale);
    return !term || movement.name[locale].toLocaleLowerCase(locale).includes(term) || movement.name.en.toLowerCase().includes(term);
  }).slice(0, 18), [locale, search]);

  const launch = async (routine: Routine) => {
    if (activeSession) return navigate("/workout");
    await startWorkout(routine);
    navigate("/workout");
  };

  const makeRoutine = async () => {
    if (!builderName.trim() || !selectedMovements.length) return;
    setSaving(true);
    const timestamp = new Date().toISOString();
    const items: RoutineItem[] = selectedMovements.map((movementId) => {
      const variant = rankVariantsForEquipment(movementId, availableEquipment)[0] ?? getVariantsForMovement(movementId)[0];
      return {
        id: createId("routine_item"),
        movementId,
        preferredVariantId: variant.id,
        restSeconds: 90,
        sets: Array.from({ length: 3 }, () => ({ id: createId("target"), type: "working" as const, minReps: 8, maxReps: 12, targetRir: 2 }))
      };
    });
    await saveUserRoutine({
      id: createId("routine"),
      name: { vi: builderName.trim(), en: builderName.trim() },
      goal: builderGoal,
      difficulty: profile.experience,
      daysPerWeek: profile.daysPerWeek,
      templateVersion: 1,
      items,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    setBuilderOpen(false);
    setBuilderName("");
    setSelectedMovements([]);
    setSaving(false);
  };

  const toggleMovement = (movementId: string) => setSelectedMovements((items) => items.includes(movementId) ? items.filter((id) => id !== movementId) : [...items, movementId]);

  return (
    <div className="page routines-page">
      <header className="page-header">
        <div><span className="eyebrow">{locale === "vi" ? "Kế hoạch" : "Programs"}</span><h1>{locale === "vi" ? "Lịch tập của bạn" : "Your routines"}</h1><p>{locale === "vi" ? "Tập theo kế hoạch hoặc tạo buổi riêng phù hợp với dụng cụ hiện có." : "Follow a plan or build a session around your equipment."}</p></div>
        <Button onClick={() => setBuilderOpen(true)}><Plus size={18} />{locale === "vi" ? "Tạo lịch mới" : "New routine"}</Button>
      </header>

      <section>
        <SectionTitle eyebrow={`${routines.length} ${locale === "vi" ? "lịch đã lưu" : "saved"}`} title={locale === "vi" ? "Sẵn sàng tập" : "Ready to train"} />
        {routines.length ? (
          <div className="routine-grid">
            {routines.map((routine, index) => (
              <Card key={routine.id} className="routine-card">
                <div className={`routine-card__visual routine-card__visual--${index % 4}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span><Dumbbell size={36} />
                </div>
                <div className="routine-card__body">
                  <span className="tag">{goalLabels[routine.goal][locale]}</span>
                  <h3>{localize(routine.name, locale)}</h3>
                  <p><Layers3 size={15} />{routine.items.length} {locale === "vi" ? "động tác" : "exercises"}<span>·</span><Clock3 size={15} />~{Math.max(25, routine.items.length * 7)} min</p>
                  <div className="routine-card__actions">
                    <Button size="sm" onClick={() => void launch(routine)}><Play size={16} fill="currentColor" />{activeSession ? (locale === "vi" ? "Tiếp tục" : "Resume") : (locale === "vi" ? "Bắt đầu" : "Start")}</Button>
                    <button type="button" className="icon-button" aria-label="Details" onClick={() => setDetail(routine)}><ChevronRight size={19} /></button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : <EmptyState icon={<Dumbbell />} title={locale === "vi" ? "Chưa có lịch tập" : "No routines yet"} body={locale === "vi" ? "Chọn mẫu bên dưới hoặc tạo lịch riêng." : "Pick a template below or create your own."} action={<Button onClick={() => setBuilderOpen(true)}>{locale === "vi" ? "Tạo lịch" : "Create routine"}</Button>} />}
      </section>

      <section className="template-section">
        <SectionTitle eyebrow={locale === "vi" ? "Miễn phí · Có sẵn offline" : "Free · Available offline"} title={locale === "vi" ? "Mẫu lịch tập" : "Routine templates"} />
        <div className="template-list">
          {ROUTINE_TEMPLATES.map((template) => {
            const installed = installedTemplates.has(template.id);
            return (
              <Card className="template-row" key={template.id}>
                <span className="template-row__index">{String(ROUTINE_TEMPLATES.indexOf(template) + 1).padStart(2, "0")}</span>
                <div><span className="tag tag--outline">{goalLabels[template.goal][locale]}</span><h3>{localize(template.name, locale)}</h3><p>{template.items.length} {locale === "vi" ? "động tác" : "exercises"} · {template.difficulty}</p></div>
                <Button variant={installed ? "ghost" : "secondary"} size="sm" disabled={installed} onClick={() => void installTemplate(template.id)}>{installed ? <Check size={16} /> : <CopyPlus size={16} />}{installed ? (locale === "vi" ? "Đã thêm" : "Added") : (locale === "vi" ? "Thêm" : "Add")}</Button>
              </Card>
            );
          })}
        </div>
      </section>

      <Modal open={Boolean(detail)} title={detail ? localize(detail.name, locale) : ""} onClose={() => setDetail(undefined)}>
        {detail ? <div className="routine-detail">
          <div className="routine-detail__summary"><span>{goalLabels[detail.goal][locale]}</span><span>{detail.items.length} {locale === "vi" ? "động tác" : "exercises"}</span><span>~{Math.max(25, detail.items.length * 7)} min</span></div>
          <ol className="exercise-sequence">{detail.items.map((item, index) => {
            const movement = MOVEMENTS.find((entry) => entry.id === item.movementId);
            const variant = getVariantsForMovement(item.movementId).find((entry) => entry.id === item.preferredVariantId);
            return <li key={item.id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{movement ? localize(movement.name, locale) : item.movementId}</strong><small>{variant ? localize(variant.name, locale) : ""}</small></div><em>{item.sets.length} × {item.sets[0]?.minReps}–{item.sets[0]?.maxReps}</em></li>;
          })}</ol>
          <div className="modal-actions"><Button variant="danger" onClick={() => { if (window.confirm(locale === "vi" ? "Xóa lịch tập này? Lịch sử đã tập vẫn được giữ lại." : "Delete this routine? Workout history will remain.")) { void removeRoutine(detail.id); setDetail(undefined); } }}><Trash2 size={17} />{locale === "vi" ? "Xóa lịch" : "Delete"}</Button><Button onClick={() => void launch(detail)}><Play size={17} />{locale === "vi" ? "Bắt đầu tập" : "Start workout"}</Button></div>
        </div> : null}
      </Modal>

      <Modal open={builderOpen} title={locale === "vi" ? "Tạo lịch tập" : "Create routine"} onClose={() => setBuilderOpen(false)} className="modal--wide">
        <div className="routine-builder">
          <div className="form-grid">
            <Field label={locale === "vi" ? "Tên lịch" : "Routine name"}><input value={builderName} onChange={(event) => setBuilderName(event.target.value)} placeholder={locale === "vi" ? "Ví dụ: Upper cuối tuần" : "e.g. Weekend upper"} /></Field>
            <Field label={locale === "vi" ? "Mục tiêu" : "Goal"}><select value={builderGoal} onChange={(event) => setBuilderGoal(event.target.value as Goal)}>{Object.entries(goalLabels).map(([id, label]) => <option value={id} key={id}>{label[locale]}</option>)}</select></Field>
          </div>
          <div className="builder-toolbar"><div className="search-box"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={locale === "vi" ? "Tìm động tác…" : "Search movements…"} /></div><span>{selectedMovements.length} {locale === "vi" ? "đã chọn" : "selected"}</span></div>
          <div className="builder-movements">{movementResults.map((movement) => {
            const selected = selectedMovements.includes(movement.id);
            const preferred = rankVariantsForEquipment(movement.id, availableEquipment)[0];
            return <button type="button" key={movement.id} onClick={() => toggleMovement(movement.id)} className={selected ? "builder-movement builder-movement--selected" : "builder-movement"}><span className="builder-movement__check">{selected ? <Check size={15} /> : <Plus size={15} />}</span><span><strong>{localize(movement.name, locale)}</strong><small>{preferred ? localize(preferred.name, locale) : ""}</small></span></button>;
          })}</div>
          <p className="fine-print">{locale === "vi" ? "Mỗi động tác được đặt mặc định 3 × 8–12, nghỉ 90 giây. Bạn có thể đổi biến thể ngay trong buổi tập." : "Each movement starts at 3 × 8–12 with 90s rest. You can switch variations during the workout."}</p>
          <div className="modal-actions"><Button variant="ghost" onClick={() => setBuilderOpen(false)}>{locale === "vi" ? "Hủy" : "Cancel"}</Button><Button disabled={saving || !builderName.trim() || !selectedMovements.length} onClick={() => void makeRoutine()}>{saving ? "…" : (locale === "vi" ? "Lưu lịch tập" : "Save routine")}</Button></div>
        </div>
      </Modal>
    </div>
  );
}
