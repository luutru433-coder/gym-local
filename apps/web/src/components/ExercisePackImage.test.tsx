import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExercisePackImage from "./ExercisePackImage";

const store = vi.hoisted(() => ({
  images: [] as { id: string; name: string; fileName: string; type: string; size: number }[],
  links: new Map<string, string | undefined>()
}));

vi.mock("@gym/storage/exercise-images", () => ({
  listExerciseImages: async () => store.images,
  getExerciseImageBlob: async () => new Blob(["x"]),
  getExerciseImage: async (variantId: string) => {
    const image = store.images.find((item) => item.id === store.links.get(variantId));
    return image ? { ...image, blob: new Blob(["x"]) } : undefined;
  },
  linkExerciseImage: async (variantId: string, imageId: string | undefined) => {
    store.links.set(variantId, imageId);
  }
}));

const image = (id: string, name: string) => ({ id, name, fileName: `${id}.gif`, type: "image/gif", size: 1 });

describe("ExercisePackImage", () => {
  beforeEach(() => {
    store.images = [];
    store.links.clear();
    URL.createObjectURL = vi.fn(() => "blob:pack-image");
    URL.revokeObjectURL = vi.fn();
  });

  it("renders nothing when no image pack was imported", async () => {
    const { container } = render(<ExercisePackImage variantId="chest_press__barbell" exerciseName="Chest Press" locale="en" />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("shows the linked image and lets the owner change or remove it", async () => {
    store.images = [image("a", "barbell bench press"), image("b", "barbell wide bench press"), image("c", "cable pulldown")];
    store.links.set("chest_press__barbell", "a");
    const user = userEvent.setup();
    render(<ExercisePackImage variantId="chest_press__barbell" exerciseName="Chest Press" locale="en" />);
    expect(await screen.findByRole("img", { name: "Chest Press: barbell bench press" })).toHaveAttribute("src", "blob:pack-image");

    await user.click(screen.getByRole("button", { name: "Change image" }));
    await user.type(screen.getByRole("searchbox", { name: "Search images" }), "wide bench");
    expect(screen.queryByRole("button", { name: "cable pulldown" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "barbell wide bench press" }));
    expect(await screen.findByRole("img", { name: "Chest Press: barbell wide bench press" })).toBeInTheDocument();
    expect(store.links.get("chest_press__barbell")).toBe("b");

    await user.click(screen.getByRole("button", { name: "Remove image" }));
    await waitFor(() => expect(screen.queryByRole("img", { name: /Chest Press/ })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Choose an image from your pack" })).toBeInTheDocument();
  });

  it("offers the picker in Vietnamese for an exercise without an image", async () => {
    store.images = [image("a", "barbell bench press")];
    render(<ExercisePackImage variantId="squat__barbell" exerciseName="Squat" locale="vi" />);
    expect(await screen.findByRole("button", { name: "Chọn hình từ gói của bạn" })).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
