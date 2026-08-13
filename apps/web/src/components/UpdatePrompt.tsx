import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@gym/ui";
import { useGymStore } from "../store/useGymStore";

export function UpdatePrompt() {
  const activeSession = useGymStore((state) => state.activeSession);
  const locale = useGymStore((state) => state.profile?.locale ?? "vi");
  const [needRefresh, setNeedRefresh] = useState(false);
  const [dismissedSessionId, setDismissedSessionId] = useState<string>();
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const reloadOnControlRef = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const serviceWorker = navigator.serviceWorker;
    let registration: ServiceWorkerRegistration | undefined;
    let disposed = false;
    const onControllerChange = () => {
      if (reloadOnControlRef.current) window.location.reload();
    };
    const markUpdateReady = () => {
      setDismissedSessionId(undefined);
      setNeedRefresh(true);
    };
    const onUpdateFound = () => {
      const worker = registration?.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && serviceWorker.controller) markUpdateReady();
      });
    };
    serviceWorker.addEventListener("controllerchange", onControllerChange);
    void serviceWorker.ready.then((readyRegistration) => {
      if (disposed) return;
      registration = readyRegistration;
      registrationRef.current = readyRegistration;
      if (readyRegistration.waiting && serviceWorker.controller) markUpdateReady();
      readyRegistration.addEventListener("updatefound", onUpdateFound);
      void readyRegistration.update().catch(() => undefined);
    });
    return () => {
      disposed = true;
      serviceWorker.removeEventListener("controllerchange", onControllerChange);
      registration?.removeEventListener("updatefound", onUpdateFound);
    };
  }, []);

  const hiddenForCurrentSession = Boolean(activeSession && dismissedSessionId === activeSession.id);
  if (!needRefresh || hiddenForCurrentSession) return null;

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
      {!activeSession ? <Button size="sm" onClick={applyUpdate}>{locale === "vi" ? "Cập nhật" : "Update"}</Button> : <Button size="sm" variant="ghost" onClick={() => setDismissedSessionId(activeSession.id)}>{locale === "vi" ? "Để sau" : "Later"}</Button>}
    </div>
  );
}
