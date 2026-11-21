import { describe, expect, it } from "vitest";
import { nutritionPackSearchQueries } from "./nutrition-pack-search";

describe("nutritionPackSearchQueries", () => {
  it("returns nothing to search for an empty or punctuation-only query", () => {
    expect(nutritionPackSearchQueries("   ")).toBeNull();
    expect(nutritionPackSearchQueries("\"*^()")).toBeNull();
  });

  it("matches every typed word as a prefix and ranks names that follow the typed order", () => {
    expect(nutritionPackSearchQueries("thịt gà")).toEqual({
      match: "\"thịt\"* \"gà\"*",
      nameStart: "{name_vi name_en} : ^ \"thịt\" + \"gà\" *",
      namePhrase: "{name_vi name_en} : \"thịt\" + \"gà\" *"
    });
  });

  it("strips FTS5 syntax so typed text cannot change the query", () => {
    expect(nutritionPackSearchQueries("name_vi:^\"cơm\"+ gà*")?.match).toBe("\"name_vi\"* \"cơm\"* \"gà\"*");
  });

  it("uses at most eight words", () => {
    expect(nutritionPackSearchQueries("a b c d e f g h i j")?.match.split(" ")).toHaveLength(8);
  });
});
