import { describe, expect, it } from "vitest";
import { detectInstallEnvironment } from "./install";

describe("detectInstallEnvironment", () => {
  it("prioritizes an already installed app", () => {
    expect(detectInstallEnvironment({ userAgent: "iPhone Safari", standalone: true, promptAvailable: false })).toBe("installed");
  });

  it("distinguishes Safari from other iOS browsers", () => {
    expect(detectInstallEnvironment({ userAgent: "Mozilla/5.0 (iPhone) AppleWebKit Safari/604.1", standalone: false, promptAvailable: false })).toBe("ios-safari");
    expect(detectInstallEnvironment({ userAgent: "Mozilla/5.0 (iPhone) AppleWebKit CriOS/130 Mobile Safari/604.1", standalone: false, promptAvailable: false })).toBe("ios-other");
  });

  it("offers the native prompt when the browser exposes one", () => {
    expect(detectInstallEnvironment({ userAgent: "Android Chrome", standalone: false, promptAvailable: true })).toBe("prompt");
    expect(detectInstallEnvironment({ userAgent: "Desktop Firefox", standalone: false, promptAvailable: false })).toBe("browser");
  });
});
