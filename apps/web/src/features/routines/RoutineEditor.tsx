import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Search, Trash2 } from "lucide-react";
import { Button, Field, Modal } from "@gym/ui";
import {
  createId,
  type Difficulty,
  type Goal,
  type Profile,
  type Routine,
  type RoutineItem,
  type RoutineSetTarget,
  type SetType
} from "@gym/contracts";
import {
  getTrackingProfile,
  getVariant,
  getVariantsForMovement,
  MOVEMENTS,
  rankVariantsForEquipment
} from "@gym/catalog";
import { localize } from "../../lib/i18n";

interface RoutineEditorProps {
  routine?: Routine;
  profile: Profile;
  onClose: () => void;
  onSave: (routine: Routine) => Promise<void>;
  onDelete?: (routine: Routine) => Promise<void>;
}

const setTypeLabels: Record<SetType, { vi: string; en: string }> = {
  warmup: { vi: "Khởi động", en: "Warm-up" },
  working: { vi: "Chính", en: "Working" },
  drop: { vi: "Drop", en: "Drop" },
  failure: { vi: "Tới ngưỡng", en: "Failure" }
};

function newSet(type: SetType = "working"): RoutineSetTarget {
  return { id: createId("target"), type, minReps: 8, maxReps: 12, targetRir: 2 };
}

function makeDraft(routine: Routine | undefined, profile: Profile): Routine {
  if (routine) return structuredClone(routine);
  const timestamp = new Date().toISOString();
  return {
    id: createId("routine"),
    name: { vi: "", en: "" },
    goal: profile.goal,
    difficulty: profile.experience,
    daysPerWeek: profile.daysPerWeek,
    templateVersion: 1,
    items: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function move<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function numeric(value: string, minimum: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : minimum;
}

export function RoutineEditor({ routine, profile, onClose, onSave, onDelete }: RoutineEditorProps) {
  const locale = profile.locale;
  const [draft, setDraft] = useState(() => makeDraft(routine, profile));
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const availableEquipment = profile.locations.find((location) => location.id === profile.activeLocationId)?.equipment ?? [];
  const movementResults = useMemo(() => {
    const term = search.trim().toLocaleLowerCase(locale);
    return MOVEMENTS.filter((movement) => !term || [movement.name.vi, movement.name.en, ...movement.aliases]
      .some((name) => name.toLocaleLowerCase(locale).includes(term))).slice(0, 16);
  }, [locale, search]);

  const updateItem = (itemId: string, update: (item: RoutineItem) => RoutineItem) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => item.id === itemId ? update(item) : item)
    }));
  };

  const addMovement = (movementId: string) => {
    const variant = rankVariantsForEquipment(movementId, availableEquipment)[0] ?? getVariantsForMovement(movementId)[0];
    if (!variant) return;
    setDraft((current) => ({
      ...current,
      items: [...current.items, {
        id: createId("routine_item"),
        movementId,
        preferredVariantId: variant.id,
        restSeconds: 90,
        sets: [newSet(), newSet(), newSet()]
      }]
    }));
  };

  const duplicateItem = (index: number) => {
    setDraft((current) => {
      const source = current.items[index];
      const copy: RoutineItem = {
        ...structuredClone(source),
        id: createId("routine_item"),
        sets: source.sets.map((set) => ({ ...set, id: createId("target") }))
      };
      const items = [...current.items];
      items.splice(index + 1, 0, copy);
      return { ...current, items };
    });
  };

  const submit = async () => {
    const viName = draft.name.vi.trim() || draft.name.en.trim();
    const enName = draft.name.en.trim() || draft.name.vi.trim();
    if (!viName || !enName || !draft.items.length) return;
    setSaving(true);
    setError(undefined);
    try {
      await onSave({
        ...draft,
        name: { vi: viName, en: enName },
        sourceTemplateId: routine?.sourceTemplateId,
        items: draft.items.map((item) => ({
          ...item,
          sets: item.sets.map((set) => set.durationSeconds !== undefined ? set : {
            ...set,
            minReps: Math.min(set.minReps ?? 8, set.maxReps ?? 12),
            maxReps: Math.max(set.minReps ?? 8, set.maxReps ?? 12)
          })
        })),
        updatedAt: new Date().toISOString()
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (locale === "vi" ? "Không thể lưu lịch tập." : "Could not save routine."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      className="modal--routine-editor"
      title={routine ? (locale === "vi" ? "Sửa lịch tập" : "Edit routine") : (locale === "vi" ? "Tạo lịch tập" : "Create routine")}
      onClose={onClose}
    >
      <div className="routine-editor">
        <div className="routine-editor__identity">
          <Field label={locale === "vi" ? "Tên tiếng Việt" : "Vietnamese name"}>
            <input value={draft.name.vi} onChange={(event) => setDraft({ ...draft, name: { ...draft.name, vi: event.target.value } })} />
          </Field>
          <Field label={locale === "vi" ? "Tên tiếng Anh" : "English name"}>
            <input value={draft.name.en} onChange={(event) => setDraft({ ...draft, name: { ...draft.name, en: event.target.value } })} />
          </Field>
          <Field label={locale === "vi" ? "Mục tiêu" : "Goal"}>
            <select value={draft.goal} onChange={(event) => setDraft({ ...draft, goal: event.target.value as Goal })}>
              <option value="hypertrophy">{locale === "vi" ? "Tăng cơ" : "Hypertrophy"}</option>
              <option value="strength">{locale === "vi" ? "Sức mạnh" : "Strength"}</option>
              <option value="fat_loss">{locale === "vi" ? "Giảm mỡ" : "Fat loss"}</option>
              <option value="general">{locale === "vi" ? "Tổng quát" : "General"}</option>
            </select>
          </Field>
          <Field label={locale === "vi" ? "Độ khó" : "Difficulty"}>
            <select value={draft.difficulty} onChange={(event) => setDraft({ ...draft, difficulty: event.target.value as Difficulty })}>
              <option value="beginner">{locale === "vi" ? "Mới bắt đầu" : "Beginner"}</option>
              <option value="intermediate">{locale === "vi" ? "Trung cấp" : "Intermediate"}</option>
              <option value="advanced">{locale === "vi" ? "Nâng cao" : "Advanced"}</option>
            </select>
          </Field>
        </div>

        <section className="routine-editor__section" aria-labelledby="routine-items-title">
          <div className="routine-editor__section-title">
            <div><h3 id="routine-items-title">{locale === "vi" ? "Thứ tự bài tập" : "Exercise order"}</h3><p>{locale === "vi" ? "Mỗi biến thể dụng cụ có lịch sử riêng." : "Each equipment variant keeps separate history."}</p></div>
            <strong aria-live="polite">{draft.items.length}</strong>
          </div>
          {draft.items.length ? <ol className="routine-item-editor-list">
            {draft.items.map((item, index) => {
              const movement = MOVEMENTS.find((entry) => entry.id === item.movementId);
              const variants = getVariantsForMovement(item.movementId);
              const tracking = getTrackingProfile(item.preferredVariantId);
              const timed = tracking?.effortKind === "duration" || tracking?.effortKind === "distance_duration";
              return <li className="routine-item-editor" key={item.id}>
                <div className="routine-item-editor__head">
                  <span className="routine-item-editor__order">{index + 1}</span>
                  <div><strong>{movement ? localize(movement.name, locale) : item.movementId}</strong><small>{localize(getVariant(item.preferredVariantId)?.name ?? { vi: "Biến thể", en: "Variant" }, locale)}</small></div>
                  <div className="routine-editor__icon-actions">
                    <button type="button" className="icon-button" disabled={index === 0} onClick={() => setDraft({ ...draft, items: move(draft.items, index, -1) })} aria-label={`${locale === "vi" ? "Đưa lên" : "Move up"}: ${movement ? localize(movement.name, locale) : item.movementId}`}><ArrowUp size={17} /></button>
                    <button type="button" className="icon-button" disabled={index === draft.items.length - 1} onClick={() => setDraft({ ...draft, items: move(draft.items, index, 1) })} aria-label={`${locale === "vi" ? "Đưa xuống" : "Move down"}: ${movement ? localize(movement.name, locale) : item.movementId}`}><ArrowDown size={17} /></button>
                    <button type="button" className="icon-button" onClick={() => duplicateItem(index)} aria-label={`${locale === "vi" ? "Nhân đôi" : "Duplicate"}: ${movement ? localize(movement.name, locale) : item.movementId}`}><Copy size={17} /></button>
                    <button type="button" className="icon-button routine-editor__delete-icon" onClick={() => setDraft({ ...draft, items: draft.items.filter((entry) => entry.id !== item.id) })} aria-label={`${locale === "vi" ? "Xóa" : "Delete"}: ${movement ? localize(movement.name, locale) : item.movementId}`}><Trash2 size={17} /></button>
                  </div>
                </div>
                <div className="routine-item-editor__config">
                  <Field label={locale === "vi" ? "Biến thể dụng cụ" : "Equipment variant"}>
                    <select value={item.preferredVariantId} onChange={(event) => updateItem(item.id, (current) => {
                      const variantId = event.target.value;
                      const effortKind = getTrackingProfile(variantId)?.effortKind;
                      const timedVariant = effortKind === "duration" || effortKind === "distance_duration";
                      return {
                        ...current,
                        preferredVariantId: variantId,
                        sets: current.sets.map((set) => timedVariant
                          ? { ...set, minReps: undefined, maxReps: undefined, durationSeconds: set.durationSeconds ?? 30 }
                          : { ...set, minReps: set.minReps ?? 8, maxReps: set.maxReps ?? 12, durationSeconds: undefined })
                      };
                    })}>
                      {variants.map((variant) => <option value={variant.id} key={variant.id}>{localize(variant.name, locale)}</option>)}
                    </select>
                  </Field>
                  <Field label={locale === "vi" ? "Nghỉ giữa set (giây)" : "Rest between sets (seconds)"}>
                    <input type="number" min={0} max={900} inputMode="numeric" value={item.restSeconds} onChange={(event) => updateItem(item.id, (current) => ({ ...current, restSeconds: numeric(event.target.value, 0, 900) }))} />
                  </Field>
                  <Field label={locale === "vi" ? "Nhóm superset" : "Superset group"} hint={locale === "vi" ? "Cùng ký hiệu để ghép bài, ví dụ A." : "Use the same label to pair exercises, e.g. A."}>
                    <input value={item.supersetGroup ?? ""} maxLength={12} onChange={(event) => updateItem(item.id, (current) => ({ ...current, supersetGroup: event.target.value.trim() || undefined }))} />
                  </Field>
                  <Field label={locale === "vi" ? "Ghi chú" : "Note"}>
                    <input value={item.note ?? ""} onChange={(event) => updateItem(item.id, (current) => ({ ...current, note: event.target.value || undefined }))} />
                  </Field>
                </div>
                <div className="routine-set-targets" aria-label={locale === "vi" ? "Mục tiêu từng set" : "Set targets"}>
                  {item.sets.map((set, setIndex) => <div className="routine-set-target" key={set.id}>
                    <span className="routine-set-target__number">{setIndex + 1}</span>
                    <Field label={locale === "vi" ? "Loại set" : "Set type"}>
                      <select value={set.type} onChange={(event) => updateItem(item.id, (current) => ({ ...current, sets: current.sets.map((entry) => entry.id === set.id ? { ...entry, type: event.target.value as SetType } : entry) }))}>
                        {Object.entries(setTypeLabels).map(([value, labels]) => <option value={value} key={value}>{labels[locale]}</option>)}
                      </select>
                    </Field>
                    {timed ? <Field label={locale === "vi" ? "Thời gian (giây)" : "Duration (seconds)"}>
                      <input type="number" min={1} max={7200} inputMode="numeric" value={set.durationSeconds ?? 30} onChange={(event) => updateItem(item.id, (current) => ({ ...current, sets: current.sets.map((entry) => entry.id === set.id ? { ...entry, durationSeconds: numeric(event.target.value, 1, 7200), minReps: undefined, maxReps: undefined } : entry) }))} />
                    </Field> : <>
                      <Field label={locale === "vi" ? "Rep tối thiểu" : "Min reps"}>
                        <input type="number" min={1} max={1000} inputMode="numeric" value={set.minReps ?? 8} onChange={(event) => updateItem(item.id, (current) => ({ ...current, sets: current.sets.map((entry) => entry.id === set.id ? { ...entry, minReps: numeric(event.target.value, 1, 1000), durationSeconds: undefined } : entry) }))} />
                      </Field>
                      <Field label={locale === "vi" ? "Rep tối đa" : "Max reps"}>
                        <input type="number" min={1} max={1000} inputMode="numeric" value={set.maxReps ?? 12} onChange={(event) => updateItem(item.id, (current) => ({ ...current, sets: current.sets.map((entry) => entry.id === set.id ? { ...entry, maxReps: numeric(event.target.value, 1, 1000), durationSeconds: undefined } : entry) }))} />
                      </Field>
                    </>}
                    <Field label="RIR">
                      <input type="number" min={0} max={10} inputMode="numeric" value={set.targetRir ?? 2} onChange={(event) => updateItem(item.id, (current) => ({ ...current, sets: current.sets.map((entry) => entry.id === set.id ? { ...entry, targetRir: numeric(event.target.value, 0, 10) } : entry) }))} />
                    </Field>
                    <button type="button" className="icon-button routine-editor__delete-icon" disabled={item.sets.length === 1} onClick={() => updateItem(item.id, (current) => ({ ...current, sets: current.sets.filter((entry) => entry.id !== set.id) }))} aria-label={`${locale === "vi" ? "Xóa set" : "Delete set"} ${setIndex + 1}`}><Trash2 size={16} /></button>
                  </div>)}
                  <Button variant="ghost" size="sm" onClick={() => updateItem(item.id, (current) => ({ ...current, sets: [...current.sets, newSet()] }))}><Plus size={16} />{locale === "vi" ? "Thêm set" : "Add set"}</Button>
                </div>
              </li>;
            })}
          </ol> : <p className="routine-editor__empty">{locale === "vi" ? "Thêm ít nhất một bài tập từ danh mục bên dưới." : "Add at least one exercise from the catalog below."}</p>}
        </section>

        <section className="routine-editor__section" aria-labelledby="add-exercise-title">
          <div className="routine-editor__section-title"><div><h3 id="add-exercise-title">{locale === "vi" ? "Thêm bài tập" : "Add exercise"}</h3><p>{locale === "vi" ? "Ưu tiên dụng cụ tại địa điểm đang chọn." : "Available equipment is ranked first."}</p></div></div>
          <div className="search-box routine-editor__search"><Search size={18} /><input aria-label={locale === "vi" ? "Tìm bài tập" : "Search exercises"} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={locale === "vi" ? "Tên bài tập…" : "Exercise name…"} /></div>
          <div className="routine-editor__catalog">
            {movementResults.map((movement) => {
              const preferred = rankVariantsForEquipment(movement.id, availableEquipment)[0] ?? getVariantsForMovement(movement.id)[0];
              return <button type="button" key={movement.id} onClick={() => addMovement(movement.id)}><Plus size={17} /><span><strong>{localize(movement.name, locale)}</strong><small>{preferred ? localize(preferred.name, locale) : ""}</small></span></button>;
            })}
          </div>
        </section>

        {error ? <p className="routine-editor__error" role="alert">{error}</p> : null}
        <div className="routine-editor__footer">
          {routine && onDelete ? <Button variant="danger" onClick={() => void onDelete(routine)}><Trash2 size={17} />{locale === "vi" ? "Xóa lịch" : "Delete routine"}</Button> : <span />}
          <div><Button variant="ghost" onClick={onClose}>{locale === "vi" ? "Hủy" : "Cancel"}</Button><Button disabled={saving || !draft.items.length || (!draft.name.vi.trim() && !draft.name.en.trim())} onClick={() => void submit()}>{saving ? "…" : (locale === "vi" ? "Lưu lịch tập" : "Save routine")}</Button></div>
        </div>
      </div>
    </Modal>
  );
}
