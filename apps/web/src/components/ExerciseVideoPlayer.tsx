import { useEffect, useState } from "react";
import { ExternalLink, PlayCircle, RotateCcw, WifiOff } from "lucide-react";
import type { ExerciseVideoGuide } from "@gym/contracts";
import { openExternalVideoGuide, youtubeEmbedUrl } from "@gym/media";
import { localize } from "../lib/i18n";

interface ExerciseVideoPlayerProps {
  guide: ExerciseVideoGuide;
  locale: "vi" | "en";
  compact?: boolean;
}

export function ExerciseVideoPlayer({ guide, locale, compact = false }: ExerciseVideoPlayerProps) {
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const reset = () => {
    setFailed(false);
    setStarted(false);
  };

  return (
    <figure className={`exercise-video${compact ? " exercise-video--compact" : ""}`}>
      <div className="exercise-video__frame">
        {started && online && !failed ? (
          <iframe
            src={youtubeEmbedUrl(guide)}
            title={localize(guide.title, locale)}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            onError={() => setFailed(true)}
          />
        ) : online && !failed ? (
          <button type="button" className="exercise-video__poster" onClick={() => setStarted(true)} aria-label={locale === "vi" ? "Phát video hướng dẫn" : "Play exercise guide"}>
            <img src={guide.thumbnailUrl} alt="" loading="lazy" onError={() => setFailed(true)} />
            <span><PlayCircle size={compact ? 46 : 64} />{locale === "vi" ? "Phát hướng dẫn" : "Play guide"}</span>
          </button>
        ) : (
          <div className="exercise-video__fallback">
            <WifiOff size={30} />
            <strong>{locale === "vi" ? "Không tải được video" : "Video unavailable"}</strong>
            <p>{locale === "vi" ? "Hướng dẫn chữ vẫn dùng được offline. Kết nối mạng rồi thử lại." : "The written guide remains available offline. Reconnect and try again."}</p>
            <button type="button" onClick={reset}><RotateCcw size={15} />{locale === "vi" ? "Thử lại" : "Retry"}</button>
          </div>
        )}
      </div>
      <figcaption>
        <div><span>{guide.demonstrationType === "3d" ? "3D" : (locale === "vi" ? "Người thực hiện" : "Human demo")}</span><strong>{localize(guide.title, locale)}</strong><small>{guide.creator} · YouTube · {locale === "vi" ? "cần Internet" : "Internet required"}</small></div>
        <button type="button" onClick={() => openExternalVideoGuide(guide)}>{locale === "vi" ? "Mở nguồn" : "Open source"}<ExternalLink size={14} /></button>
      </figcaption>
    </figure>
  );
}
