import { useEffect, useState } from "react";
import { ONLINE_GIF_CREDIT, findOnlineExerciseGif, type OnlineExerciseGif as OnlineGif } from "@gym/media/online-gifs";
import { isOnlineExerciseGifsEnabled } from "@gym/storage/device";

/**
 * A GIF looked up live for this exercise while the device is online and the owner has turned the option on.
 * Nothing is kept: offline, or when no GIF fits, it renders nothing and the bundled drawing below stands alone.
 */
export default function OnlineExerciseGif({ variant, exerciseName, locale }: { variant: { id: string; movementId: string; equipment: string[] }; exerciseName: string; locale: "vi" | "en" }) {
  const vi = locale === "vi";
  const [online, setOnline] = useState(() => navigator.onLine);
  const [gif, setGif] = useState<OnlineGif>();
  const enabled = isOnlineExerciseGifsEnabled();
  const { id, movementId } = variant;
  const equipment = variant.equipment.join(",");

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !online) return;
    const controller = new AbortController();
    void findOnlineExerciseGif({ id, movementId, equipment: equipment.split(",") }, controller.signal)
      .then((found) => { if (!controller.signal.aborted) setGif(found); })
      .catch(() => undefined);
    return () => {
      controller.abort();
      setGif(undefined);
    };
  }, [enabled, online, id, movementId, equipment]);

  if (!enabled || !online || !gif) return null;
  return (
    <figure className="online-gif">
      <img src={gif.gifUrl} alt={`${exerciseName}: ${gif.name}`} referrerPolicy="no-referrer" onError={() => setGif(undefined)} />
      <figcaption>
        <span>{vi ? "Hình trực tuyến" : "Online image"}</span>
        <strong>{gif.name}</strong>
        <small>{vi ? "Nguồn: " : "Source: "}<a href={ONLINE_GIF_CREDIT.url} target="_blank" rel="noopener noreferrer">{ONLINE_GIF_CREDIT.name}</a>{vi ? " · chỉ dùng cá nhân, phi thương mại · không lưu trên máy" : " · personal, non-commercial use · not stored on this device"}</small>
      </figcaption>
    </figure>
  );
}
