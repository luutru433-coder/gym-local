import { describe, expect, it } from "vitest";
import { customInputFromExternal } from "./exerciseDbExercise";

const details = (over: Partial<Parameters<typeof customInputFromExternal>[1]>) => ({ bodyParts: [], equipments: [], targetMuscles: [], secondaryMuscles: [], instructions: [], ...over });

describe("customInputFromExternal", () => {
  it("maps the source's muscles, equipment and steps to the app's own vocabulary", () => {
    expect(customInputFromExternal("dumbbell  incline hammer curl", details({
      bodyParts: ["upper arms"], equipments: ["dumbbell"], targetMuscles: ["biceps"], secondaryMuscles: ["forearms", "brachialis", "nonsense"],
      instructions: ["Step:1 Sit on the bench.", "Step:2 Curl up.", " "]
    }))).toEqual({
      name: "Dumbbell Incline Hammer Curl", primaryMuscle: "biceps", secondaryMuscles: ["forearms"], equipment: "dumbbell", loadEntryMode: "per_hand",
      instructions: ["Sit on the bench.", "Curl up."]
    });
  });

  it("falls back to the body part, then to a bodyweight whole-body exercise", () => {
    expect(customInputFromExternal("upward facing dog", details({ bodyParts: ["back"], equipments: ["bodyweight"], targetMuscles: ["unknown thing"] }))).toMatchObject({ primaryMuscle: "back", equipment: "bodyweight", loadEntryMode: "reps_only" });
    expect(customInputFromExternal("mystery", details({}))).toMatchObject({ primaryMuscle: "full_body", equipment: "bodyweight", loadEntryMode: "reps_only" });
    expect(customInputFromExternal("assisted pull-up", details({ equipments: ["assisted"], targetMuscles: ["latissimus dorsi"] }))).toMatchObject({ name: "Assisted Pull-Up", primaryMuscle: "back", equipment: "machine", loadEntryMode: "assisted" });
    expect(customInputFromExternal("smith squat", details({ equipments: ["smith machine"], targetMuscles: ["glutes"], secondaryMuscles: ["quadriceps", "glutes"] }))).toMatchObject({ primaryMuscle: "glutes", secondaryMuscles: ["quadriceps"], equipment: "smith" });
  });
});
