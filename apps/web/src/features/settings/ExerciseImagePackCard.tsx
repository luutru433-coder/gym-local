import { useEffect, useRef, useState } from "react";
import { Images, Trash2, Upload } from "lucide-react";
import { Button, Card, Notice } from "@gym/ui";
import { clearExerciseImagePack, exerciseImagePackSummary, type ExerciseImagePackSummary } from "@gym/storage/exercise-images";
import { importExerciseImagePack } from "./exerciseImagePackActions";

const megabytes = (bytes: number) => (bytes / 1_048_576).toFixed(bytes < 10_485_760 ? 1 : 0);

export function ExerciseImagePackCard({ locale }: { locale: "vi" | "en" }) {
  const vi = locale === "vi";
  const fileRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<ExerciseImagePackSummary>();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>();
  const [message, setMessage] = useState<{ text: string; tone: "success" | "warning" }>();

  useEffect(() => {
    let current = true;
    void exerciseImagePackSummary().then((value) => { if (current) setSummary(value); }).catch(() => undefined);
    return () => { current = false; };
  }, []);

  async function importFiles(files: File[]) {
    setBusy(true);
    setMessage(undefined);
    try {
      const result = await importExerciseImagePack(files, (stored, total) => setProgress(`${stored}/${total}`));
      setMessage(result.imported
        ? { tone: "success", text: vi ? `Đã lưu ${result.imported} hình trên máy này và gợi ý hình cho ${result.suggested} bài tập. Mở từng bài trong mục Bài tập để kiểm tra hoặc đổi hình.` : `Stored ${result.imported} images on this device and suggested an image for ${result.suggested} exercises. Open an exercise under Exercises to check or change it.` }
        : { tone: "warning", text: vi ? "Không tìm thấy file hình (GIF, WebP, PNG, JPG) trong các file đã chọn." : "No image files (GIF, WebP, PNG, JPG) were found in the selection." });
    } catch (error) {
      setMessage({ tone: "warning", text: `${vi ? "Không nhập được gói hình" : "Could not import the image pack"}: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      // Also after a failure: batches stored before it stay on the device and must be removable.
      setSummary(await exerciseImagePackSummary().catch(() => undefined));
      setBusy(false);
      setProgress(undefined);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removePack() {
    if (!window.confirm(vi ? "Xóa toàn bộ hình đã nhập khỏi máy này?" : "Remove every imported image from this device?")) return;
    setBusy(true);
    try {
      await clearExerciseImagePack();
      setSummary(await exerciseImagePackSummary());
      setMessage({ tone: "success", text: vi ? "Đã xóa gói hình khỏi máy này." : "The image pack was removed from this device." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="settings-card image-pack-card">
      <div className="settings-card__heading"><span><Images size={20} /></span><div><h3>{vi ? "Gói hình bài tập của bạn" : "Your exercise image pack"}</h3><p>{vi ? "Nhập hình bạn đã mua bản quyền. Hình chỉ lưu trên máy này, không tải lên đâu và không nằm trong file backup." : "Import images you hold a licence for. They stay on this device only, are uploaded nowhere and are not part of backups."}</p></div></div>
      {summary?.imageCount ? <p className="image-pack-summary">{vi ? `${summary.imageCount} hình · ${megabytes(summary.bytes)} MB · ${summary.linkedCount} bài tập có hình` : `${summary.imageCount} images · ${megabytes(summary.bytes)} MB · ${summary.linkedCount} exercises with an image`}</p> : null}
      <div className="image-pack-actions">
        <Button variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={17} />{busy ? `${vi ? "Đang nhập" : "Importing"}${progress ? ` ${progress}` : "…"}` : (vi ? "Chọn file hình hoặc ZIP" : "Choose image files or a ZIP")}</Button>
        {summary?.imageCount ? <Button variant="danger" disabled={busy} onClick={() => void removePack()}><Trash2 size={17} />{vi ? "Xóa gói hình" : "Remove pack"}</Button> : null}
      </div>
      <input ref={fileRef} type="file" multiple hidden accept=".zip,.json,.gif,.webp,.png,.apng,.jpg,.jpeg,.avif" aria-label={vi ? "File gói hình" : "Image pack files"} onChange={(event) => { const files = [...(event.target.files ?? [])]; if (files.length) void importFiles(files); }} />
      <small className="image-pack-hint">{vi ? "Chọn nhiều file hình cùng file JSON đi kèm (nếu có) để có tên bài tập, hoặc một file ZIP. Với gói lớn, hãy chọn các file hình bên trong một thư mục kích thước cùng file JSON, thay vì ZIP toàn bộ." : "Pick the image files together with the pack's JSON file (if it has one) to get exercise names, or one ZIP. For a large pack, select the image files inside one size folder together with the JSON file rather than a ZIP of everything."}</small>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    </Card>
  );
}
