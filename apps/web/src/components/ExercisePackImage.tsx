import { useEffect, useMemo, useState } from "react";
import { ImagePlus, Search, X } from "lucide-react";
import { getExerciseImage, getExerciseImageBlob, linkExerciseImage, listExerciseImages, type ExerciseImage } from "@gym/storage/exercise-images";

const MAX_RESULTS = 30;

function PickerThumb({ imageId, alt }: { imageId: string; alt: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let created: string | undefined;
    let current = true;
    void getExerciseImageBlob(imageId).then((blob) => {
      if (!current || !blob) return;
      created = URL.createObjectURL(blob);
      setUrl(created);
    });
    return () => {
      current = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [imageId]);
  return url ? <img src={url} alt={alt} loading="lazy" /> : <span className="pack-image-thumb-empty" />;
}

/** The owner's own imported image for this exercise, with a picker to choose or change it. Renders nothing without a pack. */
export default function ExercisePackImage({ variantId, exerciseName, locale }: { variantId: string; exerciseName: string; locale: "vi" | "en" }) {
  const vi = locale === "vi";
  const [images, setImages] = useState<ExerciseImage[]>([]);
  const [shown, setShown] = useState<{ id: string; name: string; url: string }>();
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let current = true;
    void listExerciseImages().then((list) => { if (current) setImages(list); }).catch(() => undefined);
    return () => { current = false; };
  }, []);

  useEffect(() => {
    let created: string | undefined;
    let current = true;
    void getExerciseImage(variantId).then((image) => {
      if (!current) return;
      if (!image) return setShown(undefined);
      created = URL.createObjectURL(image.blob);
      setShown({ id: image.id, name: image.name, url: created });
    }).catch(() => undefined);
    return () => {
      current = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [variantId, version]);

  const results = useMemo(() => {
    const wanted = query.toLowerCase().split(/\s+/).filter(Boolean);
    return images.filter((image) => wanted.every((word) => image.name.includes(word))).slice(0, MAX_RESULTS);
  }, [images, query]);

  if (!images.length) return null;

  async function choose(imageId: string | undefined) {
    await linkExerciseImage(variantId, imageId);
    setPicking(false);
    setQuery("");
    setVersion((value) => value + 1);
  }

  return (
    <section className="pack-image">
      {shown ? (
        <figure>
          <img src={shown.url} alt={`${exerciseName}: ${shown.name}`} />
          <figcaption><span>{vi ? "Hình từ gói của bạn" : "From your image pack"}</span><strong>{shown.name}</strong></figcaption>
        </figure>
      ) : null}
      <div className="pack-image-actions">
        <button type="button" onClick={() => setPicking((value) => !value)} aria-expanded={picking}><ImagePlus size={15} />{shown ? (vi ? "Đổi hình" : "Change image") : (vi ? "Chọn hình từ gói của bạn" : "Choose an image from your pack")}</button>
        {shown ? <button type="button" onClick={() => void choose(undefined)}><X size={15} />{vi ? "Bỏ hình" : "Remove image"}</button> : null}
      </div>
      {picking ? (
        <div className="pack-image-picker">
          <label><Search size={15} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={vi ? "Tìm theo tên hình, ví dụ: bench press" : "Search image names, e.g. bench press"} aria-label={vi ? "Tìm hình" : "Search images"} /></label>
          <ul>
            {results.map((image) => (
              <li key={image.id}><button type="button" className={image.id === shown?.id ? "is-current" : undefined} onClick={() => void choose(image.id)}><PickerThumb imageId={image.id} alt="" /><span>{image.name}</span></button></li>
            ))}
          </ul>
          {results.length === 0 ? <p>{vi ? "Không có hình nào khớp." : "No image matches."}</p> : null}
          {results.length === MAX_RESULTS ? <p>{vi ? `Đang hiện ${MAX_RESULTS} hình đầu; gõ thêm để thu hẹp.` : `Showing the first ${MAX_RESULTS}; type more to narrow down.`}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
