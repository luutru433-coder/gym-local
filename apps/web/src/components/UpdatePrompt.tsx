import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@gym/ui";
import { useGymStore } from "../store/useGymStore";

export function UpdatePrompt() {
  const activeSession = useGymStore((state) => state.activeSession);
  const locale = useGymStore((state) => state.profile?.locale ?? "vi");
  const [needRefresh, setNeedRefresh] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const reloadOnControlRef = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onControllerChange = () => {
      if (reloadOnControlRef.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    void navigator.serviceWorker.ready.then((registration) => {
      registrationRef.current = registration;
      if (registration.waiting && navigator.serviceWorker.controller) setNeedRefresh(true);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) setNeedRefresh(true);
        });
      });
      void registration.update().catch(() => undefined);
    });
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  if (!needRefresh) return null;

  const applyUpdate = () => {
    const waiting = registrationRef.current?.waiting;
    if (!waiting) return;
    reloadOnControlRef.current = true;
    waiting.postMessage({ type: "SKIP_WAITING" });
  };

  return (
    <div className="update-toast" role="status">
      <span className="update-toast__icon"><RefreshCw size={20} /></span>
      <div>
        <strong>{locale === "vi" ? "Có phiên bản mới" : "A new version is ready"}</strong>
        <p>{activeSession ? (locale === "vi" ? "Bản cập nhật đang chờ để không làm gián đoạn buổi tập." : "The update is waiting so it will not interrupt your workout.") : (locale === "vi" ? "Cập nhật khi bạn sẵn sàng." : "Update when you are ready.")}</p>
      </div>
      {!activeSession ? <Button size="sm" onClick={applyUpdate}>{locale === "vi" ? "Cập nhật" : "Update"}</Button> : <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>{locale === "vi" ? "Để sau" : "Later"}</Button>}
    </div>
  );
}
