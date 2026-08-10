import { describe, expect, it } from "vitest";
import { estimatedOneRepMax } from "./index";

describe("progress calculations", () => {
  it("uses Epley only for supported working rep ranges", () => {
    expect(estimatedOneRepMax(100, 5)).toBe(116.7);
    expect(estimatedOneRepMax(100, 11)).toBeUndefined();
  });
});
