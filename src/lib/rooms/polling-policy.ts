import type { RoomRound } from "./types";

export const WAITING_POLL_INTERVAL_MS = 3000;
export const SPINNING_POLL_INTERVAL_MS = 1200;

/** null, sürekli polling'in durması gerektiğini ifade eder. */
export function pollingIntervalFor(round: RoomRound | null): number | null {
  if (!round) return WAITING_POLL_INTERVAL_MS;
  if (round.status === "spinning") return SPINNING_POLL_INTERVAL_MS;
  if (round.status === "matching") return WAITING_POLL_INTERVAL_MS;
  if (round.status !== "voting") return null;
  return round.myVoteCount === round.candidateCount
    ? WAITING_POLL_INTERVAL_MS
    : null;
}

export function startPollingLoop(
  poll: (signal: AbortSignal) => Promise<void>,
  intervalMs: number,
  options: { immediate?: boolean } = {},
): () => void {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const run = async () => {
    try {
      await poll(controller.signal);
    } finally {
      if (!controller.signal.aborted) {
        timer = setTimeout(run, intervalMs);
      }
    }
  };

  timer = setTimeout(run, options.immediate ? 0 : intervalMs);

  return () => {
    controller.abort();
    if (timer) clearTimeout(timer);
  };
}
