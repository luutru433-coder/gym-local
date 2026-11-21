import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button, Chip, Notice } from "@gym/ui";
import { EXERCISEDB_CREDIT } from "@gym/media/online-gifs";
import { addExerciseDbExercises, listAddableExerciseDbExercises, type AddableExercise } from "./exerciseDbExerciseActions";

const SHOWN = 40;

const bodyPartVi: Record<string, string> = {
  back: "Lưng", cardio: "Cardio", chest: "Ngực", "lower arms": "Cẳng tay", "lower legs": "Bắp chân", neck: "Cổ",
  shoulders: "Vai", "upper arms": "Bắp tay", "upper legs": "Đùi", waist: "Bụng"
};

/** Lets the owner add downloaded ExerciseDB exercises that the app does not have to his own exercise list. */
export default function ExerciseDbExercisePicker({ locale }: { locale: "vi" | "en" }) {
  const vi = locale === "vi";
  const [exercises, setExercises] = useState<AddableExercise[]>();
  const [query, setQuery] = useState("");
  const [bodyPart, setBodyPart] = useState<string>();
  const [confirmAll, setConfirmAll] = useState(false);
  const [progress, setProgress] = useState<string>();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let current = true;
    void listAddableExerciseDbExercises().then((list) => { if (current) setExercises(list); }).catch(() => { if (current) setExercises([]); });
    return () => { current = false; };
  }, [version]);

  const bodyParts = useMemo(() => [...new Set((exercises ?? []).flatMap((exercise) => exercise.details.bodyParts))].sort(), [exercises]);
  const results = useMemo(() => {
    const wanted = query.toLowerCase().split(/\s+/).filter(Boolean);
    return (exercises ?? []).filter((exercise) => (!bodyPart || exercise.details.bodyParts.includes(bodyPart)) && wanted.every((word) => exercise.name.includes(word)));
  }, [bodyPart, exercises, query]);

  if (!exercises) return null;
  if (!exercises.length) {
    return <Notice>{vi
      ? "Chưa có bài nào để thêm. Vào Cài đặt → Hình bài tập và bấm \"Tải hình ExerciseDB miễn phí\" (bấm lại nếu bạn đã tải trước bản cập nhật này), rồi quay lại đây."
      : "Nothing to add yet. Go to Settings → Exercise images and press \"Download free ExerciseDB images\" (press it again if you downloaded before this update), then come back."}</Notice>;
  }

  async function add(list: AddableExercise[]) {
    setConfirmAll(false);
    setProgress(`0/${list.length}`);
    try {
      await addExerciseDbExercises(list, (done, total) => setProgress(`${done}/${total}`));
    } finally {
      setProgress(undefined);
      setVersion((value) => value + 1);
    }
  }

  const busy = progress !== undefined;
  return (
    <div className="exercisedb-picker">
      <p>{vi
        ? "Các bài có hình trong bộ ExerciseDB đã tải nhưng chưa có trong app. Bài được thêm sẽ nằm trong danh sách bài tập của bạn, kèm hình, và chọn được khi xây lịch tập. Tên và hướng dẫn bằng tiếng Anh."
        : "Exercises from the downloaded ExerciseDB set that the app does not have yet. An added exercise joins your exercise list with its image and can be picked when you build a routine. Names and steps are in English."}{" "}
        <a href={EXERCISEDB_CREDIT.url} target="_blank" rel="noreferrer">{EXERCISEDB_CREDIT.name}</a>
      </p>
      <div className="search-box"><Search size={18} /><input aria-label={vi ? "Tìm bài ExerciseDB" : "Search ExerciseDB exercises"} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={vi ? "Tìm bằng tên tiếng Anh…" : "Search by name…"} /><span aria-live="polite">{results.length}</span></div>
      <div className="filter-scroll" role="group" aria-label={vi ? "Lọc theo vùng cơ thể" : "Filter by body part"}>
        <Chip active={!bodyPart} onClick={() => setBodyPart(undefined)}>{vi ? "Tất cả" : "All"}</Chip>
        {bodyParts.map((item) => <Chip key={item} active={bodyPart === item} onClick={() => setBodyPart(bodyPart === item ? undefined : item)}>{vi ? bodyPartVi[item] ?? item : item}</Chip>)}
      </div>
      {busy ? <Notice>{vi ? `Đang thêm ${progress}…` : `Adding ${progress}…`}</Notice> : null}
      {results.length > 1 && !busy ? (
        confirmAll
          ? <div className="exercisedb-picker__confirm"><span>{vi ? `Thêm cả ${results.length} bài vào danh sách của bạn?` : `Add all ${results.length} exercises to your list?`}</span><Button onClick={() => void add(results)}>{vi ? "Thêm" : "Add"}</Button><Button variant="secondary" onClick={() => setConfirmAll(false)}>{vi ? "Hủy" : "Cancel"}</Button></div>
          : <Button variant="secondary" onClick={() => setConfirmAll(true)}><Plus size={16} />{vi ? `Thêm tất cả ${results.length} bài đang hiện` : `Add all ${results.length} listed`}</Button>
      ) : null}
      <ul className="exercisedb-picker__list">
        {results.slice(0, SHOWN).map((exercise) => (
          <li key={exercise.id}>
            <div><strong>{exercise.name}</strong><span>{[...exercise.details.targetMuscles, ...exercise.details.equipments].join(" · ")}</span></div>
            <Button variant="secondary" disabled={busy} aria-label={`${vi ? "Thêm" : "Add"} ${exercise.name}`} onClick={() => void add([exercise])}><Plus size={16} />{vi ? "Thêm" : "Add"}</Button>
          </li>
        ))}
      </ul>
      {results.length > SHOWN ? <p className="exercisedb-picker__more">{vi ? `Đang hiện ${SHOWN}/${results.length} bài. Tìm hoặc lọc để thu hẹp.` : `Showing ${SHOWN} of ${results.length}. Search or filter to narrow down.`}</p> : null}
    </div>
  );
}
