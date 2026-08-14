export type InstallEnvironment = "installed" | "ios-safari" | "ios-other" | "prompt" | "browser";

export interface InstallEnvironmentInput {
  userAgent: string;
  standalone: boolean;
  promptAvailable: boolean;
}

export interface DeferredInstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function detectInstallEnvironment(input: InstallEnvironmentInput): InstallEnvironment {
  if (input.standalone) return "installed";
  const ios = /iphone|ipad|ipod/i.test(input.userAgent);
  if (ios) {
    const safari = /safari/i.test(input.userAgent) && !/crios|fxios|edgios|opios/i.test(input.userAgent);
    return safari ? "ios-safari" : "ios-other";
  }
  return input.promptAvailable ? "prompt" : "browser";
}

export function isStandaloneApp(): boolean {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  const displayModeStandalone = typeof window.matchMedia === "function"
    && window.matchMedia("(display-mode: standalone)").matches;
  return displayModeStandalone || navigatorWithStandalone.standalone === true;
}
