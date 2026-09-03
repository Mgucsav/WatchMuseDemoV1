import { describe, expect, it } from "vitest";

import { parseRoomRoundState, parseRoomTelepartyStates } from "./round-service";

function candidate(id: number, position: number) {
  return {
    id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
    position,
    tmdbMovieId: id,
    title: `Film ${id}`,
    originalTitle: null,
    posterPath: null,
    overview: null,
    releaseYear: 2020,
    voteAverage: 7,
  };
}

function validState() {
  return {
    round: {
      id: "f4bde699-e65a-48fc-ae7c-1ba94f06d82c",
      roundNumber: 2,
      status: "voting",
      candidateCount: 10,
      candidates: Array.from({ length: 10 }, (_, index) =>
        candidate(index + 1, index + 1),
      ),
      myVotes: {},
      myVoteCount: 0,
      partnerCompleted: false,
      matchedCandidates: [],
      winnerCandidate: null,
      spinStartedAt: null,
      spinDurationMs: 7000,
    },
    pendingSelections: [] as Record<string, unknown>[],
  };
}

describe("room state privacy parser", () => {
  it("tam 10 benzersiz aday sözleşmesini kabul eder", () => {
    const parsed = parseRoomRoundState(validState());
    expect(parsed.round?.candidates).toHaveLength(10);
    expect(new Set(parsed.round?.candidates.map((entry) => entry.tmdbMovieId)).size).toBe(10);
  });

  it("belirlenmiş film oturumu için tek adaylı sonuç turunu kabul eder", () => {
    const selected = candidate(42, 1);
    const base = validState();
    const state = {
      ...base,
      round: {
        ...base.round,
        status: "result",
        candidateCount: 1,
        candidates: [selected],
        matchedCandidates: [selected],
        winnerCandidate: selected,
        spinStartedAt: "2026-09-03T12:00:00.000Z",
      },
    };

    expect(parseRoomRoundState(state).round?.candidateCount).toBe(1);
  });

  it("tekrarlanan TMDb kimliğini reddeder", () => {
    const state = validState();
    state.round.candidates[1].tmdbMovieId = state.round.candidates[0].tmdbMovieId;
    expect(() => parseRoomRoundState(state)).toThrow();
  });

  it.each([
    "partnerVotes",
    "partnerLibrary",
    "partnerAccepted",
    "acceptedByUserId",
    "voteCounts",
    "signalCounts",
  ])("beklenmeyen kişi/sinyal alanı %s reddedilir", (field) => {
    const state = validState() as Record<string, unknown>;
    state[field] = {};
    expect(() => parseRoomRoundState(state)).toThrow();
  });

  it("selection yanıtında yalnızca çağıranın myAccepted alanını kabul eder", () => {
    const state = validState();
    state.pendingSelections = [
      {
        id: "0198da7e-225f-7d83-bceb-a3321b1fa1d0",
        tmdbMovieId: 42,
        title: "Film 42",
        posterPath: null,
        selectedAt: "2026-08-12T12:00:00.000Z",
        responseDeadline: "2026-08-19T12:00:00.000Z",
        myAccepted: false,
      },
    ];
    expect(parseRoomRoundState(state).pendingSelections[0].myAccepted).toBe(false);
  });
});

describe("Teleparty ortak durum ayrıştırıcısı", () => {
  it("iki taraf hazır olduğunda resmi bağlantıyı kabul eder", () => {
    expect(
      parseRoomTelepartyStates([
        {
          selectionId: "0198da7e-225f-7d83-bceb-a3321b1fa1d0",
          bothAccepted: true,
          joinUrl: "https://redirect.teleparty.com/join/390d2c023aec4fcf",
        },
      ])[0].joinUrl,
    ).toBe("https://redirect.teleparty.com/join/390d2c023aec4fcf");
  });

  it("hazır olmadan bağlantı sızdırılmasını reddeder", () => {
    expect(() =>
      parseRoomTelepartyStates([
        {
          selectionId: "0198da7e-225f-7d83-bceb-a3321b1fa1d0",
          bothAccepted: false,
          joinUrl: "https://redirect.teleparty.com/join/390d2c023aec4fcf",
        },
      ]),
    ).toThrow();
  });

  it("resmi olmayan hedefi reddeder", () => {
    expect(() =>
      parseRoomTelepartyStates([
        {
          selectionId: "0198da7e-225f-7d83-bceb-a3321b1fa1d0",
          bothAccepted: true,
          joinUrl: "https://example.com/join/390d2c023aec4fcf",
        },
      ]),
    ).toThrow();
  });
});
