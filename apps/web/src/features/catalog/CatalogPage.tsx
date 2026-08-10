import { useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Dumbbell, Info, Search, ShieldCheck, SlidersHorizontal, Target } from "lucide-react";
import { Button, Card, Chip, EmptyState, Modal, Notice } from "@gym/ui";
import type { EquipmentType, ExerciseVariant, MuscleGroup } from "@gym/contracts";
import { EQUIPMENT_OPTIONS, getVariantsForMovement, MOVEMENTS, rankVariantsForEquipment, searchCatalog } from "@gym/catalog";
import { openExternalMedia } from "@gym/media";
import { localize } from "../../lib/i18n";
import { useGymStore } from "../../store/useGymStore";
import { ExerciseVideoPlayer } from "../../components/ExerciseVideoPlayer";

const muscleLabels: Record<MuscleGroup, { vi: string; en: string }> = {
  chest: { vi: "Ngực", en: "Chest" }, back: { vi: "Lưng", en: "Back" }, shoulders: { vi: "Vai", en: "Shoulders" },
  biceps: { vi: "Tay trước", en: "Biceps" }, triceps: { vi: "Tay sau", en: "Triceps" }, quadriceps: { vi: "Đùi trước", en: "Quads" },
  hamstrings: { vi: "Đùi sau", en: "Hamstrings" }, glutes: { vi: "Mông", en: "Glutes" }, calves: { vi: "Bắp chân", en: "Calves" },
  core: { vi: "Core", en: "Core" }, forearms: { vi: "Cẳng tay", en: "Forearms" }, full_body: { vi: "Toàn thân", en: "Full body" }
};

const muscleFilters: MuscleGroup[] = ["chest", "back", "shoulders", "quadriceps", "hamstrings", "glutes", "biceps", "triceps", "core"];

export function CatalogPage() {
  const profile = useGymStore((state) => state.profile)!;
  const locale = profile.locale;
  const availableEquipment = profile.locations.find((location) => location.id === profile.activeLocationId)?.equipment ?? [];
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState<MuscleGroup>();
  const [equipment, setEquipment] = useState<EquipmentType>();
  const [selectedMovementId, setSelectedMovementId] = useState<string>();
  const [selectedVariant, setSelectedVariant] = useState<ExerciseVariant>();

  const results = useMemo(() => searchCatalog(query, muscle, equipment), [equipment, muscle, query]);
  const selectedMovement = MOVEMENTS.find((movement) => movement.id === selectedMovementId);
  const variants = selectedMovement ? rankVariantsForEquipment(selectedMovement.id, availableEquipment) : [];
  const activeVariant = selectedVariant ?? variants[0];
  const referenceImage = activeVariant?.media.find((asset) => asset.type === "image");
  const tutorialVideo = activeVariant?.videoGuides[0];

  const openMovement = (id: string) => {
    setSelectedMovementId(id);
    setSelectedVariant(undefined);
  };

  const closeMovement = () => {
    setSelectedMovementId(undefined);
    setSelectedVariant(undefined);
  };

  return (
    <div className="page catalog-page">
      <header className="page-header">
        <div><span className="eyebrow">{MOVEMENTS.length} {locale === "vi" ? "nhóm động tác" : "movement families"}</span><h1>{locale === "vi" ? "Thư viện bài tập" : "Exercise library"}</h1><p>{locale === "vi" ? "Một động tác, nhiều cách tập. Chọn theo dụng cụ bạn đang có." : "One movement, many ways to train. Choose what fits your equipment."}</p></div>
      </header>

      <Card className="catalog-toolbar">
        <div className="search-box search-box--large"><Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={locale === "vi" ? "Tìm chest press, kéo lưng, squat…" : "Search chest press, row, squat…"} /><span>{results.length}</span></div>
        <div className="filter-line"><SlidersHorizontal size={17} /><div className="filter-scroll"><Chip active={!muscle} onClick={() => setMuscle(undefined)}>{locale === "vi" ? "Tất cả cơ" : "All muscles"}</Chip>{muscleFilters.map((item) => <Chip key={item} active={muscle === item} onClick={() => setMuscle(muscle === item ? undefined : item)}>{muscleLabels[item][locale]}</Chip>)}</div></div>
        <div className="filter-line"><Dumbbell size={17} /><div className="filter-scroll"><Chip active={!equipment} onClick={() => setEquipment(undefined)}>{locale === "vi" ? "Mọi dụng cụ" : "All equipment"}</Chip>{EQUIPMENT_OPTIONS.map((item) => <Chip key={item.id} active={equipment === item.id} onClick={() => setEquipment(equipment === item.id ? undefined : item.id)}>{item.name[locale]}</Chip>)}</div></div>
      </Card>

      {results.length ? (
        <div className="movement-grid">
          {results.map((movement, index) => {
            const allVariants = getVariantsForMovement(movement.id);
            const readyCount = allVariants.filter((variant) => variant.equipment.every((item) => availableEquipment.includes(item))).length;
            return (
              <Card
                className="movement-card"
                key={movement.id}
                role="button"
                tabIndex={0}
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
                  <Dumbbell size={40} strokeWidth={1.5} />
                  <span className="muscle-stamp">{muscleLabels[movement.primaryMuscles[0]][locale]}</span>
                </div>
                <div className="movement-card__body">
                  <span className="eyebrow">{movement.pattern} · {movement.primaryMuscles.map((item) => muscleLabels[item][locale]).join(", ")}</span>
                  <h3>{localize(movement.name, locale)}</h3>
                  <div className="movement-card__meta"><span><LayersIcon />{allVariants.length} {locale === "vi" ? "biến thể" : "variations"}</span><span className={readyCount ? "ready-count" : ""}><CheckCircle2 size={15} />{readyCount} {locale === "vi" ? "sẵn sàng" : "ready"}</span></div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : <EmptyState icon={<Search />} title={locale === "vi" ? "Không tìm thấy bài phù hợp" : "No matching movement"} body={locale === "vi" ? "Thử bỏ bớt bộ lọc hoặc tìm bằng tên tiếng Anh." : "Remove a filter or try another search term."} />}

      <Modal open={Boolean(selectedMovement)} title={selectedMovement ? localize(selectedMovement.name, locale) : ""} onClose={closeMovement} className="modal--exercise">
        {selectedMovement && activeVariant ? (
          <div className="exercise-detail">
            <div className="exercise-detail__hero">
              <div><span className="eyebrow">{selectedMovement.pattern} · {selectedMovement.primaryMuscles.map((item) => muscleLabels[item][locale]).join(", ")}</span><p>{localize(selectedMovement.description, locale)}</p></div>
              <span className="review-badge"><ShieldCheck size={16} />{locale === "vi" ? "Nội dung đã rà soát" : "Reviewed content"}</span>
            </div>

            <section className="variant-section">
              <div className="variant-heading"><div><span className="eyebrow">{locale === "vi" ? "Chọn cách tập" : "Choose your setup"}</span><h3>{localize(activeVariant.name, locale)}</h3></div><span>{variants.indexOf(activeVariant) + 1}/{variants.length}</span></div>
              <div className="variant-tabs">{variants.map((variant) => {
                const ready = variant.equipment.every((item) => availableEquipment.includes(item));
                return <button type="button" key={variant.id} className={variant.id === activeVariant.id ? "variant-tab variant-tab--active" : "variant-tab"} onClick={() => setSelectedVariant(variant)}><span>{localize(variant.name, locale)}</span><small>{ready ? <><CheckCircle2 size={13} />{locale === "vi" ? "Bạn có đủ dụng cụ" : "Equipment ready"}</> : variant.equipment.map((item) => EQUIPMENT_OPTIONS.find((entry) => entry.id === item)?.name[locale]).join(" + ")}</small></button>;
              })}</div>
            </section>

            {referenceImage ? <figure className="exercise-media-preview"><div><img src={referenceImage.url} alt={localize(referenceImage.title, locale)} loading="lazy" onError={(event) => event.currentTarget.parentElement?.classList.add("media-load-error")} /><span>{locale === "vi" ? "Cần Internet để tải hình" : "Internet required for image"}</span></div><figcaption><span className="eyebrow">Free Exercise DB · Unlicense</span><strong>{localize(referenceImage.title, locale)}</strong><p>{locale === "vi" ? "Hình tham khảo công khai; hướng dẫn song ngữ của Gym Local vẫn dùng được offline." : "Public-domain reference; Gym Local's written guide remains available offline."}</p><Button size="sm" variant="ghost" onClick={() => openExternalMedia(referenceImage)}>{locale === "vi" ? "Mở ảnh nguồn" : "Open source image"}<ArrowUpRight size={15} /></Button></figcaption></figure> : null}

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
