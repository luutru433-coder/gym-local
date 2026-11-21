import type { WorkoutSession } from "@gym/contracts";
import { listBodyMetrics, listSessions } from "@gym/storage";
import { deleteBodyMetric, deleteFinishedSession, updateFinishedSession } from "@gym/storage/history";
import { useGymStore } from "../../store/useGymStore";

/** History corrections live with the Progress page so they stay out of the entry chunk. */
export async function removeBodyMetric(id: string): Promise<void> {
  await deleteBodyMetric(id);
  useGymStore.setState({ bodyMetrics: await listBodyMetrics() });
}

export async function updatePastSession(session: WorkoutSession): Promise<void> {
  await updateFinishedSession(session);
  useGymStore.setState({ sessions: await listSessions() });
}

export async function removePastSession(id: string): Promise<void> {
  await deleteFinishedSession(id);
  useGymStore.setState({ sessions: await listSessions() });
}
