import { useEffect } from "react";
import { isRestAlertMuted } from "@gym/storage";

type AudioContextConstructor = typeof AudioContext;
let audioContext: AudioContext | undefined;

function getAudioContext(): AudioContext | undefined {
  if (audioContext) return audioContext;
  const Constructor: AudioContextConstructor | undefined = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
  if (!Constructor) return undefined;
  try {
    audioContext = new Constructor();
  } catch {
    audioContext = undefined;
  }
  return audioContext;
}

/** Browsers only allow sound after a user gesture, so call this from a tap. */
export function primeRestAlert(): void {
  const context = getAudioContext();
  if (context?.state === "suspended") void context.resume().catch(() => undefined);
}

export function playRestAlert(): void {
  if (isRestAlertMuted()) return;
  try {
    navigator.vibrate?.([220, 120, 220]);
  } catch {
    // Vibration is optional (not available on iOS).
  }
  const context = getAudioContext();
  if (!context) return;
  try {
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    [0, 0.22, 0.44].forEach((offset, index) => {
      const start = context.currentTime + offset;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = index === 2 ? 1175 : 880;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.2);
    });
  } catch {
    // Sound is best-effort; the visual timer still shows the rest is over.
  }
}

/** Keeps the screen on while `active`, re-acquiring the lock when the app returns to the foreground. */
export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return undefined;
    let sentinel: WakeLockSentinel | undefined;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || (sentinel && !sentinel.released)) return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (cancelled) void next.release().catch(() => undefined);
        else sentinel = next;
      } catch {
        // Denied (for example low battery): the workout keeps working without it.
      }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
