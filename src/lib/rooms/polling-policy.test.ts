import { afterEach, describe, expect, it, vi } from "vitest";

import type { RoomRound } from "./types";
import {
  pollingIntervalFor,
  SPINNING_POLL_INTERVAL_MS,
  startPollingLoop,
  WAITING_POLL_INTERVAL_MS,
} from "./polling-policy";

function round(patch: Partial<RoomRound> = {}): RoomRound {
  return {
    id: "f4bde699-e65a-48fc-ae7c-1ba94f06d82c",
    roundNumber: 1,
    status: "voting",
    candidateCount: 10,
    candidates: [],
    myVotes: {},
    myVoteCount: 0,
    partnerCompleted: false,
    matchedCandidates: [],
    winnerCandidate: null,
    spinStartedAt: null,
    spinDurationMs: 7000,
    ...patch,
  };
}

afterEach(() => vi.useRealTimers());

describe("state-aware polling", () => {
  it("aktif kişisel oy sırasında polling yapmaz", () => {
    expect(pollingIntervalFor(round({ myVoteCount: 3 }))).toBeNull();
  });

  it("partner beklerken üç saniyede poll eder", () => {
    expect(pollingIntervalFor(round({ myVoteCount: 10 }))).toBe(
      WAITING_POLL_INTERVAL_MS,
    );
  });

  it("çark sırasında yaklaşık 1.2 saniyede poll eder", () => {
    expect(pollingIntervalFor(round({ status: "spinning" }))).toBe(
      SPINNING_POLL_INTERVAL_MS,
    );
  });

  it("result ve no_match sonrasında polling durur", () => {
    expect(pollingIntervalFor(round({ status: "result" }))).toBeNull();
    expect(pollingIntervalFor(round({ status: "no_match" }))).toBeNull();
  });

  it("cleanup timer'ı temizler ve in-flight isteği abort eder", async () => {
    vi.useFakeTimers();
    const seenSignal: { current: AbortSignal | null } = { current: null };
    const poll = vi.fn(async (signal: AbortSignal) => {
      seenSignal.current = signal;
      await new Promise<void>(() => undefined);
    });
    const stop = startPollingLoop(poll, 3000, { immediate: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(poll).toHaveBeenCalledTimes(1);
    stop();
    expect(seenSignal.current?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(9000);
    expect(poll).toHaveBeenCalledTimes(1);
  });
});
