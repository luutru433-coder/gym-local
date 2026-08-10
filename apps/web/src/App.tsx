import { lazy, Suspense, useEffect } from "react";
import { AlertTriangle, CheckCircle2, Dumbbell, X } from "lucide-react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { Onboarding } from "./features/onboarding/Onboarding";
import { useGymStore } from "./store/useGymStore";

const HomePage = lazy(() => import("./features/home/HomePage").then((module) => ({ default: module.HomePage })));
const RoutinesPage = lazy(() => import("./features/routines/RoutinesPage").then((module) => ({ default: module.RoutinesPage })));
const CatalogPage = lazy(() => import("./features/catalog/CatalogPage").then((module) => ({ default: module.CatalogPage })));
const NutritionPage = lazy(() => import("./features/nutrition/NutritionPage").then((module) => ({ default: module.NutritionPage })));
const ProgressPage = lazy(() => import("./features/progress/ProgressPage").then((module) => ({ default: module.ProgressPage })));
const SettingsPage = lazy(() => import("./features/settings/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const WorkoutPage = lazy(() => import("./features/workout/WorkoutPage").then((module) => ({ default: module.WorkoutPage })));

export function App() {
  const ready = useGymStore((state) => state.ready);
  const busy = useGymStore((state) => state.busy);
  const profile = useGymStore((state) => state.profile);
  const error = useGymStore((state) => state.error);
  const notice = useGymStore((state) => state.notice);
  const clearNotice = useGymStore((state) => state.clearNotice);
  const hydrate = useGymStore((state) => state.hydrate);

  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(clearNotice, 3500);
    return () => window.clearTimeout(timer);
  }, [clearNotice, notice]);

  if (!ready || busy && !profile) {
    return <div className="boot-screen"><span className="boot-screen__mark"><Dumbbell size={30} /></span><strong>GYMLOCAL</strong><div className="boot-loader"><i /><i /><i /></div><p>Loading your local data…</p></div>;
  }

  if (!profile?.onboardingComplete) return <><Onboarding />{error ? <GlobalMessage tone="error" message={error} /> : null}</>;

  return (
    <HashRouter>
      <Suspense fallback={<RouteLoader />}>
        <Routes>
          <Route path="/workout" element={<WorkoutPage />} />
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="routines" element={<RoutinesPage />} />
            <Route path="catalog" element={<CatalogPage />} />
            <Route path="nutrition" element={<NutritionPage />} />
            <Route path="progress" element={<ProgressPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
      <UpdatePrompt />
      {notice ? <GlobalMessage tone="success" message={notice} onClose={clearNotice} /> : null}
      {error ? <GlobalMessage tone="error" message={error} /> : null}
    </HashRouter>
  );
}

function RouteLoader() {
  return <div className="route-loader"><span /><span /><span /></div>;
}

function GlobalMessage({ message, tone, onClose }: { message: string; tone: "success" | "error"; onClose?: () => void }) {
  return <div className={`global-message global-message--${tone}`} role="status">{tone === "success" ? <CheckCircle2 size={19} /> : <AlertTriangle size={19} />}<span>{message}</span>{onClose ? <button type="button" onClick={onClose}><X size={16} /></button> : null}</div>;
}
