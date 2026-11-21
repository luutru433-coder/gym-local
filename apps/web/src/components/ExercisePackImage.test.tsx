import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExercisePackImage from "./ExercisePackImage";

const store = vi.hoisted(() => ({
  images: [] as { id: string; name: string; fileName: string; type: string; size: number; remoteUrl?: string }[],
  saved: [] as string[],
  links: new Map<string, string | undefined>()
}));

vi.mock("@gym/storage/exercise-images", () => ({
  listExerciseImages: async () => store.images,
  getExerciseImageBlob: async () => new Blob(["x"]),
  getExerciseImage: async (variantId: string) => {
    const image = store.images.find((item) => item.id === store.links.get(variantId));
    if (!image) return undefined;
    return image.remoteUrl ? image : { ...image, blob: new Blob(["x"]) };
  },
  linkExerciseImage: async (variantId: string, imageId: string | undefined) => {
    store.links.set(variantId, imageId);
  }
}));

vi.mock("@gym/media/online-gifs", () => ({
  EXERCISEDB_CREDIT: { name: "AscendAPI.com", url: "https://ascendapi.com" },
  storeExerciseDbGifs: async (urls: string[]) => { store.saved.push(...urls); return { stored: urls.length, failed: 0 }; }
}));

const image = (id: string, name: string) => ({ id, name, fileName: `${id}.gif`, type: "image/gif", size: 1 });

describe("ExercisePackImage", () => {
  beforeEach(() => {
    store.images = [];
    store.links.clear();
    store.saved = [];
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

  it("shows a downloaded ExerciseDB GIF with the AscendAPI credit and saves a newly chosen one", async () => {
    const remote = (id: string, name: string) => ({ ...image(id, name), remoteUrl: `https://static.exercisedb.dev/media/${id}.gif` });
    store.images = [remote("r1", "barbell bench press"), remote("r2", "barbell decline bench press")];
    store.links.set("chest_press__barbell", "r1");
    const user = userEvent.setup();
    const view = render(<ExercisePackImage variantId="chest_press__barbell" exerciseName="Chest Press" locale="en" />);
    const shown = await screen.findByRole("img", { name: "Chest Press: barbell bench press" });
    expect(shown).toHaveAttribute("src", "https://static.exercisedb.dev/media/r1.gif");
    expect(screen.getByRole("link", { name: "AscendAPI.com" })).toHaveAttribute("href", "https://ascendapi.com");

    await user.click(screen.getByRole("button", { name: "Change image" }));
    await user.click(screen.getByRole("button", { name: "barbell decline bench press" }));
    const changed = await screen.findByRole("img", { name: "Chest Press: barbell decline bench press" });
    expect(store.saved).toEqual(["https://static.exercisedb.dev/media/r2.gif"]);

    // Offline with a GIF that was never saved: say so instead of a broken image.
    fireEvent.error(changed);
    expect(await screen.findByText(/not saved on the device yet/)).toBeInTheDocument();
    view.unmount();
  });

  it("offers the picker in Vietnamese for an exercise without an image", async () => {
    store.images = [image("a", "barbell bench press")];
    render(<ExercisePackImage variantId="squat__barbell" exerciseName="Squat" locale="vi" />);
    expect(await screen.findByRole("button", { name: "Chọn hình từ gói của bạn" })).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
