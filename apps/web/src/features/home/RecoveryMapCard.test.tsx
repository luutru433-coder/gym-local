import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkoutSession } from "@gym/contracts";
import { getMovement, getTrackingProfile, getVariant } from "@gym/catalog";
import { RecoveryMapCard } from "./RecoveryMapCard";

const updatePastSession = vi.hoisted(() => vi.fn());
vi.mock("../progress/history-actions", () => ({ updatePastSession }));

function finishedSession(): WorkoutSession {
  const variant = getVariant("chest_press__dumbbell")!;
  const movement = getMovement(variant.movementId)!;
  const finishedAt = new Date(Date.now() - 3 * 3_600_000).toISOString();
  return {
    id: "session-done",
    startedAt: new Date(Date.now() - 4 * 3_600_000).toISOString(),
    finishedAt,
    exercises: [{
      id: "exercise-one",
      movementId: movement.id,
      movementNameSnapshot: movement.name,
      variantId: variant.id,
      variantNameSnapshot: variant.name,
      loadEntryModeSnapshot: variant.loadEntryMode,
      trackingProfileSnapshot: getTrackingProfile(variant.id),
      sets: [1, 2, 3, 4, 5].map((index) => ({ id: `set-${index}`, type: "working" as const, load: 20, reps: 8, rir: 0, completedAt: finishedAt })),
      restSeconds: 90
    }]
  };
}

describe("RecoveryMapCard soreness", () => {
  afterEach(() => { cleanup(); updatePastSession.mockReset(); });

  it("asks about the last workout's main muscles and saves the answer on that session", async () => {
    const session = finishedSession();
    updatePastSession.mockResolvedValue(undefined);
    render(<RecoveryMapCard locale="vi" sessions={[session]} />);

    const chest = screen.getByRole("group", { name: "Ngực" });
    await userEvent.click(within(chest).getByRole("button", { name: "Vẫn còn đau" }));

    await waitFor(() => expect(updatePastSession).toHaveBeenCalledWith({ ...session, soreness: { chest: 4 } }));
  });

  it("shows the saved answer, clears it on a second tap, and has no questions without a recent workout", async () => {
    const session = { ...finishedSession(), soreness: { chest: 4 as const } };
    updatePastSession.mockResolvedValue(undefined);
    const view = render(<RecoveryMapCard locale="en" sessions={[session]} />);

    const stillSore = within(screen.getByRole("group", { name: "Chest" })).getByRole("button", { name: "Still sore" });
    expect(stillSore).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(stillSore);
    await waitFor(() => expect(updatePastSession).toHaveBeenCalledWith({ ...session, soreness: {} }));

    view.rerender(<RecoveryMapCard locale="en" sessions={[]} />);
    expect(screen.queryByRole("group", { name: "Chest" })).toBeNull();
  });
});
