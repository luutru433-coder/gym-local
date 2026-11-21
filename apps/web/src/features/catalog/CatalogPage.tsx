import { Suspense, lazy, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Dumbbell, Info, Pencil, Plus, Search, ShieldCheck, SlidersHorizontal, Target, Trash2, UserRound } from "lucide-react";
import { Button, Card, Chip, EmptyState, Modal, Notice } from "@gym/ui";
import type { EquipmentType, ExerciseVariant, Movement, MuscleGroup } from "@gym/contracts";
import { EQUIPMENT_OPTIONS, getExerciseAnimation, getMovementAnimation, getMovement, getVariantsForMovement, listMovements, rankVariantsForEquipment, searchCatalog } from "@gym/catalog";
import type { CustomExerciseInput } from "@gym/catalog/custom";
import { removeUserCustomExercise, saveUserCustomExercise } from "./customExerciseActions";
import { CustomExerciseForm } from "./CustomExerciseForm";
import { localize } from "../../lib/i18n";
import { useGymStore } from "../../store/useGymStore";
import { ExerciseVideoPlayer } from "../../components/ExerciseVideoPlayer";
import { ExerciseAnimation } from "../../components/ExerciseAnimation";

const ExercisePackImage = lazy(() => import("../../components/ExercisePackImage"));
const OnlineExerciseGif = lazy(() => import("../../components/OnlineExerciseGif"));
import { frameUrl, muscleLabels } from "../../lib/exercise-visuals";


const muscleFilters: MuscleGroup[] = ["chest", "back", "shoulders", "quadriceps", "hamstrings", "glutes", "biceps", "triceps", "core"];

const patternLabels: Record<Movement["pattern"], { vi: string; en: string }> = {
  push: { vi: "Đẩy", en: "Push" },
  pull: { vi: "Kéo", en: "Pull" },
  squat: { vi: "Squat", en: "Squat" },
  hinge: { vi: "Gập hông", en: "Hinge" },
  lunge: { vi: "Chùng chân", en: "Lunge" },
  isolation: { vi: "Cô lập", en: "Isolation" },
  core: { vi: "Core", en: "Core" },
  carry: { vi: "Mang tải", en: "Carry" }
};

export function CatalogPage() {
  const profile = useGymStore((state) => state.profile)!;
  const locale = profile.locale;
  const availableEquipment = profile.locations.find((location) => location.id === profile.activeLocationId)?.equipment ?? [];
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState<MuscleGroup>();
  const [equipment, setEquipment] = useState<EquipmentType>();
  const [selectedMovementId, setSelectedMovementId] = useState<string>();
  const [selectedVariant, setSelectedVariant] = useState<ExerciseVariant>();

  const customMovements = useGymStore((state) => state.customMovements);
  const [formMode, setFormMode] = useState<"create" | "edit">();
  const [deleteError, setDeleteError] = useState<string>();

  const movements = useMemo(() => listMovements(customMovements), [customMovements]);
  const results = useMemo(() => searchCatalog(query, muscle, equipment, movements), [equipment, movements, muscle, query]);
  const movementCount = movements.length;
  const selectedMovement = selectedMovementId ? getMovement(selectedMovementId) : undefined;
  const selectedIsCustom = customMovements.some((movement) => movement.id === selectedMovementId);
  const variants = selectedMovement ? rankVariantsForEquipment(selectedMovement.id, availableEquipment) : [];
  const activeVariant = selectedVariant ?? variants[0];
  const tutorialVideo = activeVariant?.videoGuides[0];

  const openMovement = (id: string) => {
    setSelectedMovementId(id);
    setSelectedVariant(undefined);
  };

  const closeMovement = () => {
    setSelectedMovementId(undefined);
    setSelectedVariant(undefined);
    setFormMode(undefined);
    setDeleteError(undefined);
  };

  const submitCustomExercise = async (input: CustomExerciseInput) => {
    const saved = await saveUserCustomExercise(input, formMode === "edit" ? selectedMovementId : undefined);
    setFormMode(undefined);
    setSelectedVariant(undefined);
    setSelectedMovementId(saved.id);
  };

  const deleteSelected = async () => {
    if (!selectedMovement) return;
    const question = locale === "vi"
      ? `Xóa bài "${localize(selectedMovement.name, locale)}"? Các buổi tập đã lưu vẫn được giữ.`
      : `Delete "${localize(selectedMovement.name, locale)}"? Saved workouts are kept.`;
    if (!window.confirm(question)) return;
    try {
      await removeUserCustomExercise(selectedMovement.id);
      closeMovement();
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <div className="page catalog-page">
      <header className="page-header">
        <div><span className="eyebrow">{movementCount} {locale === "vi" ? "nhóm động tác" : "movement families"}</span><h1>{locale === "vi" ? "Thư viện bài tập" : "Exercise library"}</h1><p>{locale === "vi" ? "Một động tác, nhiều cách tập. Chọn theo dụng cụ bạn đang có." : "One movement, many ways to train. Choose what fits your equipment."}</p></div>
        <Button variant="secondary" onClick={() => setFormMode("create")}><Plus size={18} />{locale === "vi" ? "Tạo bài tập" : "Create exercise"}</Button>
      </header>

      <Card className="catalog-toolbar">
        <div className="search-box search-box--large"><Search size={20} /><input aria-label={locale === "vi" ? "Tìm bài tập" : "Search exercises"} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={locale === "vi" ? "Tìm chest press, kéo lưng, squat…" : "Search chest press, row, squat…"} /><span aria-live="polite">{results.length}</span></div>
        <div className="filter-line"><SlidersHorizontal size={17} /><div className="filter-scroll" role="group" aria-label={locale === "vi" ? "Lọc theo nhóm cơ" : "Filter by muscle"}><Chip active={!muscle} onClick={() => setMuscle(undefined)}>{locale === "vi" ? "Tất cả cơ" : "All muscles"}</Chip>{muscleFilters.map((item) => <Chip key={item} active={muscle === item} onClick={() => setMuscle(muscle === item ? undefined : item)}>{muscleLabels[item][locale]}</Chip>)}</div></div>
        <div className="filter-line"><Dumbbell size={17} /><div className="filter-scroll" role="group" aria-label={locale === "vi" ? "Lọc theo dụng cụ" : "Filter by equipment"}><Chip active={!equipment} onClick={() => setEquipment(undefined)}>{locale === "vi" ? "Mọi dụng cụ" : "All equipment"}</Chip>{EQUIPMENT_OPTIONS.map((item) => <Chip key={item.id} active={equipment === item.id} onClick={() => setEquipment(equipment === item.id ? undefined : item.id)}>{item.name[locale]}</Chip>)}</div></div>
      </Card>

      {results.length ? (
        <div className="movement-grid">
          {results.map((movement, index) => {
            const allVariants = getVariantsForMovement(movement.id);
            const cardAnimation = getMovementAnimation(movement.id);
            const readyCount = allVariants.filter((variant) => variant.equipment.every((item) => availableEquipment.includes(item))).length;
            return (
              <Card
                className="movement-card"
                key={movement.id}
                role="button"
                tabIndex={0}
                aria-haspopup="dialog"
                aria-label={`${localize(movement.name, locale)} · ${allVariants.length} ${locale === "vi" ? "biến thể" : "variations"}`}
                onClick={() => openMovement(movement.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openMovement(movement.id);
                  }
                }}
              >
                <div className={`movement-card__visual movement-card__visual--${index % 6}`}>
                  <span className="movement-card__number">{String(index + 1).padStart(2, "0")}</span>
                  {cardAnimation ? <img className="movement-card__figure" src={frameUrl(cardAnimation.frames[0])} alt="" loading="lazy" /> : <Dumbbell size={40} strokeWidth={1.5} />}
                  <span className="muscle-stamp">{muscleLabels[movement.primaryMuscles[0]][locale]}</span>
                </div>
                <div className="movement-card__body">
                  <span className="eyebrow">{patternLabels[movement.pattern][locale]} · {movement.primaryMuscles.map((item) => muscleLabels[item][locale]).join(", ")}</span>
                  <h3>{localize(movement.name, locale)}</h3>
                  <div className="movement-card__meta"><span><LayersIcon />{allVariants.length} {locale === "vi" ? "biến thể" : "variations"}</span><span className={readyCount ? "ready-count" : ""}><CheckCircle2 size={15} />{readyCount} {locale === "vi" ? "sẵn sàng" : "ready"}</span></div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : <EmptyState icon={<Search />} title={locale === "vi" ? "Không tìm thấy bài phù hợp" : "No matching movement"} body={locale === "vi" ? "Thử bỏ bớt bộ lọc hoặc tìm bằng tên tiếng Anh." : "Remove a filter or try another search term."} />}

      <Modal open={formMode === "create"} title={locale === "vi" ? "Tạo bài tập của bạn" : "Create your exercise"} onClose={() => setFormMode(undefined)}>
        {formMode === "create" ? <CustomExerciseForm locale={locale} onSave={submitCustomExercise} onCancel={() => setFormMode(undefined)} /> : null}
      </Modal>

      <Modal open={Boolean(selectedMovement) && formMode !== "create"} title={selectedMovement ? localize(selectedMovement.name, locale) : ""} onClose={closeMovement} className="modal--exercise">
        {selectedMovement && activeVariant && formMode === "edit" ? (
          <CustomExerciseForm locale={locale} movement={selectedMovement} variant={activeVariant} onSave={submitCustomExercise} onCancel={() => setFormMode(undefined)} />
        ) : selectedMovement && activeVariant && selectedIsCustom ? (
          <div className="exercise-detail">
            <div className="exercise-detail__hero">
              <div><span className="eyebrow">{selectedMovement.primaryMuscles.map((item) => muscleLabels[item][locale]).join(", ")} · {activeVariant.equipment.map((item) => EQUIPMENT_OPTIONS.find((entry) => entry.id === item)?.name[locale]).join(" + ")}</span><p>{localize(selectedMovement.description, locale)}</p></div>
              <span className="review-badge"><UserRound size={16} />{locale === "vi" ? "Bài tự tạo" : "Your exercise"}</span>
            </div>
            <ExerciseAnimation key={`${activeVariant.id}-${selectedMovement.contentVersion}`} animation={undefined} primaryMuscles={selectedMovement.primaryMuscles} secondaryMuscles={selectedMovement.secondaryMuscles} locale={locale} />
            {deleteError ? <Notice tone="warning">{deleteError}</Notice> : null}
            <div className="custom-exercise-actions">
              <Button variant="secondary" onClick={() => { setDeleteError(undefined); setFormMode("edit"); }}><Pencil size={17} />{locale === "vi" ? "Sửa" : "Edit"}</Button>
              <Button variant="danger" onClick={() => void deleteSelected()}><Trash2 size={17} />{locale === "vi" ? "Xóa" : "Delete"}</Button>
            </div>
            <Notice>{locale === "vi" ? "Bài tự tạo chỉ lưu trên máy này và nằm trong file sao lưu. Chưa có hình động minh họa." : "Your exercises stay on this device and are included in backups. No animation is available."}</Notice>
          </div>
        ) : selectedMovement && activeVariant ? (
          <div className="exercise-detail">
            <div className="exercise-detail__hero">
              <div><span className="eyebrow">{patternLabels[selectedMovement.pattern][locale]} · {selectedMovement.primaryMuscles.map((item) => muscleLabels[item][locale]).join(", ")}</span><p>{localize(selectedMovement.description, locale)}</p></div>
              <span className="review-badge"><ShieldCheck size={16} />{locale === "vi" ? "Nội dung đã rà soát" : "Reviewed content"}</span>
            </div>

            <section className="variant-section">
              <div className="variant-heading"><div><span className="eyebrow">{locale === "vi" ? "Chọn cách tập" : "Choose your setup"}</span><h3>{localize(activeVariant.name, locale)}</h3></div><span>{variants.indexOf(activeVariant) + 1}/{variants.length}</span></div>
              <div className="variant-tabs" role="group" aria-label={locale === "vi" ? "Biến thể bài tập" : "Exercise variations"}>{variants.map((variant) => {
                const ready = variant.equipment.every((item) => availableEquipment.includes(item));
                return <button type="button" key={variant.id} className={variant.id === activeVariant.id ? "variant-tab variant-tab--active" : "variant-tab"} aria-pressed={variant.id === activeVariant.id} onClick={() => setSelectedVariant(variant)}><span>{localize(variant.name, locale)}</span><small>{ready ? <><CheckCircle2 size={13} />{locale === "vi" ? "Bạn có đủ dụng cụ" : "Equipment ready"}</> : variant.equipment.map((item) => EQUIPMENT_OPTIONS.find((entry) => entry.id === item)?.name[locale]).join(" + ")}</small></button>;
              })}</div>
            </section>

            <Suspense fallback={null}><ExercisePackImage key={`pack-${activeVariant.id}`} variantId={activeVariant.id} exerciseName={localize(selectedMovement.name, locale)} locale={locale} fallback={<OnlineExerciseGif variant={activeVariant} exerciseName={localize(selectedMovement.name, locale)} locale={locale} />} /></Suspense>
            <ExerciseAnimation key={activeVariant.id} animation={getExerciseAnimation(activeVariant.id)} primaryMuscles={selectedMovement.primaryMuscles} secondaryMuscles={selectedMovement.secondaryMuscles} locale={locale} />


            <div className="instruction-layout">
              <section>
                <h3><Target size={19} />{locale === "vi" ? "Cách thực hiện" : "How to perform"}</h3>
                <ol className="instruction-list">{activeVariant.instructions.map((instruction, index) => <li key={`${activeVariant.id}-${index}`}><span>{index + 1}</span><p>{localize(instruction, locale)}</p></li>)}</ol>
              </section>
              <aside>
                <div className="cue-box"><h4><CheckCircle2 size={17} />{locale === "vi" ? "Cue cần nhớ" : "Key cues"}</h4>{activeVariant.cues.map((cue, index) => <p key={index}>{localize(cue, locale)}</p>)}</div>
                <div className="safety-box"><h4><AlertTriangle size={17} />{locale === "vi" ? "An toàn" : "Safety"}</h4>{activeVariant.safety.map((item, index) => <p key={index}>{localize(item, locale)}</p>)}</div>
              </aside>
            </div>

            <section className="mistakes-section"><h3><Info size={19} />{locale === "vi" ? "Lỗi thường gặp" : "Common mistakes"}</h3><div>{activeVariant.commonMistakes.map((mistake, index) => <p key={index}><span>{index + 1}</span>{localize(mistake, locale)}</p>)}</div></section>

            {tutorialVideo ? <section><h3 className="video-section-title">{locale === "vi" ? "Video đúng biến thể đang chọn" : "Video for this exact variation"}</h3><ExerciseVideoPlayer guide={tutorialVideo} locale={locale} /></section> : null}
            <Notice>{locale === "vi" ? "Hướng dẫn dùng cho mục đích tham khảo. Nếu bạn có chấn thương hoặc đau bất thường, hãy hỏi chuyên gia y tế trước khi tập." : "Guidance is informational. If you have an injury or unusual pain, consult a qualified health professional."}</Notice>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function LayersIcon() {
  return <span className="stack-icon"><i /><i /><i /></span>;
}
