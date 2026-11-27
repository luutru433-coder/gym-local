import { useEffect, useEffectEvent, useRef } from "react";
import { isLockScreenTimerEnabled } from "@gym/storage/device";
import type { FocusSet, FocusState } from "./SetFocus";
import { clock } from "./clock";
import { playRestAlert, playRestSound } from "./restAlert";
import carrierUrl from "./timer-carrier.mp3?inline";
import alertUrl from "./timer-alert.mp3?inline";

interface Props {
  locale: "vi" | "en";
  state: FocusState;
  now: number;
  restEndsAt?: string;
  plannedRest: number;
  onStart: () => void;
  onEnd: () => void;
  onSkip: () => void;
}

const artworkUrl = new URL(`${import.meta.env.BASE_URL}icon-192.png`, document.baseURI).href;

function setTarget(set?: FocusSet): string {
  if (!set) return "Gym Local";
  const effort = `${set.effort.value} ${set.effort.unit}`;
  return set.load ? `${set.load.value} ${set.load.label} × ${effort}` : effort;
}

export function WorkoutMedia({ locale, state, now, restEndsAt, plannedRest, onStart, onEnd, onSkip }: Props) {
  const armedRestEnd = useRef<string | undefined>(undefined);
  const restWindow = useRef<{ endsAt: string; duration: number } | undefined>(undefined);
  const controller = useRef<{ publish: () => void; alert: () => boolean } | undefined>(undefined);
  const restFinished = state.phase === "rest" && state.remaining === 0;

  const publish = useEffectEvent((media: MediaSession, paused: boolean) => {
    const set = state.phase === "rest" ? state.next : state.phase === "finished" ? undefined : state.set;
    const title = state.phase === "rest"
      ? (restFinished ? (locale === "vi" ? "Hết giờ nghỉ" : "Rest complete") : `${locale === "vi" ? "Nghỉ" : "Rest"} ${clock(state.remaining)}`)
      : set ? `Set ${set.setNumber} · ${set.exerciseName}`
      : (locale === "vi" ? "Buổi tập Gym Local" : "Gym Local workout");
    const artist = setTarget(set);
    if (media.metadata?.title !== title || media.metadata.artist !== artist) {
      media.metadata = new MediaMetadata({ title, artist, artwork: [{ src: artworkUrl, sizes: "192x192", type: "image/png" }] });
    }
    if (state.phase === "rest" && restEndsAt) {
      const remaining = Math.max(0, (Date.parse(restEndsAt) - now) / 1000);
      if (restWindow.current?.endsAt !== restEndsAt) {
        restWindow.current = { endsAt: restEndsAt, duration: Math.max(plannedRest, remaining) };
      }
      const { duration } = restWindow.current;
      if (duration > 0) media.setPositionState?.({ duration, playbackRate: 1, position: Math.max(0, duration - remaining) });
      else media.setPositionState?.();
    } else {
      restWindow.current = undefined;
      media.setPositionState?.();
    }
    const playbackState = paused ? "paused" : "playing";
    if (media.playbackState !== playbackState) media.playbackState = playbackState;
  });

  const advance = useEffectEvent(() => {
    if (state.phase === "running" && state.canEnd) onEnd();
    else if (state.phase === "rest" || state.phase === "ready") onStart();
  });
  const skip = useEffectEvent(() => {
    if (state.phase === "rest") onSkip();
  });

  useEffect(() => {
    if (!isLockScreenTimerEnabled() || !navigator.mediaSession || typeof MediaMetadata === "undefined") return;
    const media = navigator.mediaSession;
    let audio: HTMLAudioElement | undefined;
    let engaged = false;
    let paused = false;
    let alerting = false;
    let disposed = false;
    const registered: MediaSessionAction[] = [];

    const refresh = () => { if (engaged && audio) publish(media, paused || audio.paused); };
    const playCarrier = (element: HTMLAudioElement) => {
      alerting = false;
      element.src = carrierUrl;
      element.loop = true;
      void element.play().then(() => {
        if (disposed || paused || element.paused) return;
        if (!engaged) {
          engaged = true;
          registerActions();
        }
        refresh();
      }).catch(() => undefined);
    };
    const resume = () => {
      if (!audio) {
        audio = new Audio();
        audio.addEventListener("ended", () => { if (!disposed && !paused && audio && alerting) playCarrier(audio); });
      }
      if (!audio.paused && !paused) return;
      paused = false;
      playCarrier(audio);
    };
    const pause = () => {
      paused = true;
      audio?.pause();
      refresh();
    };
    const registerActions = () => {
      const actions: [MediaSessionAction, () => void][] = [
        ["nexttrack", () => advance()],
        ["seekforward", () => advance()],
        ["previoustrack", () => skip()],
        ["seekbackward", () => skip()],
        ["play", resume],
        ["pause", pause]
      ];
      for (const [action, handler] of actions) {
        try {
          media.setActionHandler(action, handler);
          registered.push(action);
        } catch {
          // Browsers may only expose a subset of Media Session actions.
        }
      }
    };
    const prime = () => { if (!paused && !alerting) resume(); };
    const alert = () => {
      const element = audio;
      if (!engaged || paused || !element || element.paused) return false;
      alerting = true;
      element.loop = false;
      element.src = alertUrl;
      void element.play().catch(() => {
        if (disposed || paused || !alerting) return;
        playRestSound();
        playCarrier(element);
      });
      return true;
    };

    controller.current = { publish: refresh, alert };
    window.addEventListener("click", prime, true);
    return () => {
      disposed = true;
      window.removeEventListener("click", prime, true);
      controller.current = undefined;
      audio?.pause();
      audio?.removeAttribute("src");
      if (!engaged) return;
      for (const action of registered) media.setActionHandler(action, null);
      media.metadata = null;
      media.setPositionState?.();
      media.playbackState = "none";
    };
  }, []);

  useEffect(() => {
    controller.current?.publish();
    if (state.phase !== "rest" || !restEndsAt) {
      armedRestEnd.current = undefined;
      return;
    }
    if (!restFinished) {
      if (Date.parse(restEndsAt) > Date.now()) armedRestEnd.current = restEndsAt;
      return;
    }
    if (armedRestEnd.current === restEndsAt) {
      armedRestEnd.current = undefined;
      playRestAlert(controller.current?.alert);
    }
  }, [locale, now, plannedRest, restEndsAt, restFinished, state]);

  return null;
}
