import { afterEach, describe, expect, it, vi } from "vitest";

import type { RoomRound } from "./types";
import {
  MAX_TRANSIENT_POLL_FAILURES,
  TERMINAL_POLL_INTERVAL_MS,
  WAITING_POLL_INTERVAL_MS,
  classifyPollFailure,
  isSelectionExpired,
  pollingIntervalFor,
  SPINNING_POLL_INTERVAL_MS,
  startPollingLoop,
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

  it("terminal turda düşük frekansla yenilenir (agresif polling'e dönmez)", () => {
    // E-1: partnerin başlattığı yeni tur tam sayfa yenilemesi olmadan görünür.
    expect(pollingIntervalFor(round({ status: "result" }))).toBe(
      TERMINAL_POLL_INTERVAL_MS,
    );
    expect(pollingIntervalFor(round({ status: "no_match" }))).toBe(
      TERMINAL_POLL_INTERVAL_MS,
    );
    // 1,2 sn'lik agresif polling geri gelmemelidir.
    expect(TERMINAL_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(
      WAITING_POLL_INTERVAL_MS * 5,
    );
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

describe("classifyPollFailure — sınırlı yeniden deneme", () => {
  it("ilk hatalar yeniden denenir, oda görünümü korunur", () => {
    expect(classifyPollFailure(1)).toBe("retry");
    expect(classifyPollFailure(MAX_TRANSIENT_POLL_FAILURES - 1)).toBe("retry");
  });

  it("sınıra ulaşınca kalıcı hata yüzeye çıkar", () => {
    expect(classifyPollFailure(MAX_TRANSIENT_POLL_FAILURES)).toBe("surface");
    expect(classifyPollFailure(MAX_TRANSIENT_POLL_FAILURES + 5)).toBe("surface");
  });
});

describe("isSelectionExpired — kabul penceresi", () => {
  const now = new Date("2026-08-25T12:00:00.000Z");

  it("gelecekteki son tarih açıktır", () => {
    expect(isSelectionExpired("2026-08-26T12:00:00.000Z", now)).toBe(false);
  });

  it("geçmiş son tarih dolmuştur", () => {
    expect(isSelectionExpired("2026-08-24T12:00:00.000Z", now)).toBe(true);
  });

  it("tam sınırda dolmuş sayılır", () => {
    expect(isSelectionExpired("2026-08-25T12:00:00.000Z", now)).toBe(true);
  });

  it("eksik veya bozuk tarih açık kabul edilir (yanlış kapatma yapmaz)", () => {
    expect(isSelectionExpired(null, now)).toBe(false);
    expect(isSelectionExpired(undefined, now)).toBe(false);
    expect(isSelectionExpired("tarih degil", now)).toBe(false);
  });
});
