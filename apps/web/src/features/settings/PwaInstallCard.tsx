import { useEffect, useState } from "react";
import { Check, Download, Share2, Smartphone } from "lucide-react";
import { Button, Card, Notice } from "@gym/ui";
import { detectInstallEnvironment, isStandaloneApp, type DeferredInstallPrompt } from "../../pwa/install";

export function PwaInstallCard({ locale }: { locale: "vi" | "en" }) {
  const [installPrompt, setInstallPrompt] = useState<DeferredInstallPrompt>();
  const [installed, setInstalled] = useState(() => isStandaloneApp());

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as DeferredInstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(undefined);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const environment = detectInstallEnvironment({
    userAgent: navigator.userAgent,
    standalone: installed,
    promptAvailable: Boolean(installPrompt)
  });

  const requestInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallPrompt(undefined);
  };

  return (
    <Card className="install-card">
      <div className="settings-card__heading">
        <span><Smartphone size={19} /></span>
        <div>
          <h3>{locale === "vi" ? "Cài trên điện thoại" : "Install on your phone"}</h3>
          <p>{locale === "vi" ? "PWA cá nhân miễn phí, mở từ biểu tượng như một app." : "A free personal PWA that opens from an app icon."}</p>
        </div>
      </div>

      {environment === "installed" ? (
        <Notice tone="success"><Check size={15} />{locale === "vi" ? "Đang chạy ở chế độ ứng dụng." : "Running in app mode."}</Notice>
      ) : null}

      {environment === "ios-safari" || environment === "ios-other" ? (
        <>
          {environment === "ios-other" ? <Notice tone="warning">{locale === "vi" ? "Hãy mở trang này bằng Safari để thêm vào Màn hình chính." : "Open this page in Safari to add it to the Home Screen."}</Notice> : null}
          <ol className="install-steps">
            <li><span>1</span><p>{locale === "vi" ? "Trong Safari, chạm nút Chia sẻ." : "In Safari, tap Share."}<Share2 size={15} /></p></li>
            <li><span>2</span><p>{locale === "vi" ? "Chọn Thêm vào Màn hình chính." : "Choose Add to Home Screen."}</p></li>
            <li><span>3</span><p>{locale === "vi" ? "Bật Mở dưới dạng ứng dụng rồi chạm Thêm." : "Turn on Open as Web App, then tap Add."}</p></li>
          </ol>
        </>
      ) : null}

      {environment === "prompt" ? <Button size="sm" onClick={() => void requestInstall()}><Download size={16} />{locale === "vi" ? "Cài Gym Local" : "Install Gym Local"}</Button> : null}
      {environment === "browser" ? <p className="install-card__hint">{locale === "vi" ? "Mở menu trình duyệt và chọn Cài ứng dụng hoặc Thêm vào màn hình chính." : "Open the browser menu and choose Install app or Add to Home Screen."}</p> : null}

      <p className="install-card__pack-note">{locale === "vi"
        ? "Sau khi cài, vào Dinh dưỡng → Tải & cài kho thực phẩm một lần. Kho dữ liệu và nhật ký sau đó dùng được khi offline."
        : "After installing, open Nutrition → Download & install the food pack once. The data pack and logs then work offline."}</p>
    </Card>
  );
}
