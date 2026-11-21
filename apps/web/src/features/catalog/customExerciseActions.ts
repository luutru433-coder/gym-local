import type { Movement } from "@gym/contracts";
import { setCustomExercises } from "@gym/catalog";
import { buildCustomExercise, type CustomExerciseInput } from "@gym/catalog/custom";
import { deleteCustomExercise, saveCustomExercise } from "@gym/storage/custom-exercises";
import { useGymStore } from "../../store/useGymStore";

// Kept out of the store so this code loads with the exercise library, not with the app shell.

export async function saveUserCustomExercise(input: CustomExerciseInput, movementId?: string): Promise<Movement> {
  const state = useGymStore.getState();
  const previousMovement = movementId ? state.customMovements.find((movement) => movement.id === movementId) : undefined;
  const previousVariant = previousMovement ? state.customVariants.find((variant) => variant.movementId === previousMovement.id) : undefined;
  const name = input.name.trim().toLocaleLowerCase();
  if (state.customMovements.some((movement) => movement.id !== movementId && movement.reviewStatus !== "deprecated" && movement.name.vi.trim().toLocaleLowerCase() === name)) {
    throw new Error(state.profile?.locale === "en" ? "You already have a custom exercise with this name." : "Bạn đã có bài tập tự tạo trùng tên này.");
  }
  const setupChanged = previousVariant && (previousVariant.loadEntryMode !== input.loadEntryMode || previousVariant.equipment[0] !== input.equipment);
  const logged = [...state.sessions, ...(state.activeSession ? [state.activeSession] : [])]
    .some((session) => session.exercises.some((exercise) => exercise.movementId === movementId && exercise.sets.some((set) => set.completedAt)));
  if (setupChanged && logged) {
    // Same variant ID means same history: old loads must not carry over to different equipment or load entry.
    throw new Error(state.profile?.locale === "en"
      ? "This exercise already has logged sets, so its equipment and load entry cannot change. Create a new exercise instead."
      : "Bài này đã có set được ghi, nên không đổi được dụng cụ và cách nhập tải. Hãy tạo bài mới.");
  }
  const { movement, variant } = buildCustomExercise(input, previousMovement && previousVariant
    ? { movementId: previousMovement.id, variantId: previousVariant.id, contentVersion: previousMovement.contentVersion }
    : undefined);
  await saveCustomExercise(movement, variant);
  const current = useGymStore.getState();
  const customMovements = [movement, ...current.customMovements.filter((item) => item.id !== movement.id)];
  const customVariants = [variant, ...current.customVariants.filter((item) => item.id !== variant.id)];
  setCustomExercises(customMovements, customVariants);
  useGymStore.setState({
    customMovements,
    customVariants,
    notice: current.profile?.locale === "en" ? "Custom exercise saved." : "Đã lưu bài tập tự tạo."
  });
  return movement;
}

export async function removeUserCustomExercise(movementId: string): Promise<void> {
  const state = useGymStore.getState();
  const en = state.profile?.locale === "en";
  if (state.routines.some((routine) => routine.items.some((item) => item.movementId === movementId))) {
    throw new Error(en ? "Remove this exercise from your routines before deleting it." : "Hãy gỡ bài này khỏi các lịch tập trước khi xóa.");
  }
  if (state.activeSession?.exercises.some((exercise) => exercise.movementId === movementId)) {
    throw new Error(en ? "This exercise is in the workout in progress." : "Bài này đang nằm trong buổi tập đang diễn ra.");
  }
  const kept = await deleteCustomExercise(movementId);
  const current = useGymStore.getState();
  const customMovements = kept
    ? current.customMovements.map((movement) => movement.id === movementId ? { ...movement, reviewStatus: "deprecated" as const } : movement)
    : current.customMovements.filter((movement) => movement.id !== movementId);
  const customVariants = kept
    ? current.customVariants.map((variant) => variant.movementId === movementId ? { ...variant, reviewStatus: "deprecated" as const } : variant)
    : current.customVariants.filter((variant) => variant.movementId !== movementId);
  setCustomExercises(customMovements, customVariants);
  useGymStore.setState({
    customMovements,
    customVariants,
    notice: en ? "Custom exercise deleted. Workout history was preserved." : "Đã xóa bài tập tự tạo. Lịch sử buổi tập vẫn được giữ."
  });
}
