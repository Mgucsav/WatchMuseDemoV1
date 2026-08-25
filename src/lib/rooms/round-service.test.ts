import { describe, expect, it } from "vitest";

import { parseRoomRoundState } from "./round-service";

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
