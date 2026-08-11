import "server-only";

import { toPosterUrl } from "@/lib/tmdb/normalize";
import type { MovieSummary } from "@/lib/tmdb/types";
import {
  createSupabaseServerClient,
  getAuthenticatedUserId,
} from "@/lib/supabase/server";
import { isLocalRoomsBackend } from "./backend";
import { normalizeRoomError, roomError } from "./errors";
import { RoomServiceError } from "./service";
import { isRecord } from "./validation";
import type {
  RoomCandidate,
  RoomRoundState,
  RoomRoundStatus,
  RoomVoteChoice,
} from "./types";

function fail(code: Parameters<typeof roomError>[0]): never {
  throw new RoomServiceError(roomError(code));
}

async function getClientAndUser() {
  if (isLocalRoomsBackend()) fail("round_requires_supabase");

  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) fail("not_configured");

  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) fail("unauthenticated");

  return supabase;
}

function serializedCandidates(candidates: MovieSummary[]) {
  return candidates.map((movie) => ({
    tmdbMovieId: movie.id,
    title: movie.title,
    originalTitle: movie.originalTitle,
    posterPath: movie.posterPath,
    overview: movie.overview,
    releaseYear: movie.releaseYear,
    voteAverage: movie.voteAverage,
  }));
}

/** İlk turu, ya da ortak aday çıkmadıysa yeni turu atomik olarak başlatır. */
export async function initializeRoomRound(
  spaceId: string,
  candidates: MovieSummary[],
  reset: boolean,
): Promise<void> {
  if (candidates.length !== 10) fail("invalid_candidates");
  const supabase = await getClientAndUser();
  const { error } = await supabase.rpc("create_or_reset_space_round", {
    p_space_id: spaceId,
    p_candidates: serializedCandidates(candidates),
    p_reset: reset,
  });
  if (error) throw new RoomServiceError(normalizeRoomError(error));
}

export async function voteInRoomRound(
  spaceId: string,
  candidateId: string,
  choice: RoomVoteChoice,
): Promise<void> {
  const supabase = await getClientAndUser();
  const { error } = await supabase.rpc("cast_space_round_vote", {
    p_space_id: spaceId,
    p_candidate_id: candidateId,
    p_choice: choice,
  });
  if (error) throw new RoomServiceError(normalizeRoomError(error));
}

export async function startRoomRoundWheel(spaceId: string): Promise<void> {
  const supabase = await getClientAndUser();
  const { error } = await supabase.rpc("start_space_round_wheel", {
    p_space_id: spaceId,
  });
  if (error) throw new RoomServiceError(normalizeRoomError(error));
}

/**
 * Tek, kurallı okuma kanalından dönen JSON'u doğrular.
 * Veritabanı yanıtı beklenmeyen biçimdeyse ham değer istemciye sızmaz.
 */
export async function getRoomRoundState(
  spaceId: string,
): Promise<RoomRoundState> {
  const supabase = await getClientAndUser();
  const { data, error } = await supabase.rpc("get_space_round_state", {
    p_space_id: spaceId,
  });
  if (error) throw new RoomServiceError(normalizeRoomError(error));
  return parseRoomRoundState(data);
}

const ROUND_STATUSES: readonly RoomRoundStatus[] = [
  "voting",
  "matching",
  "spinning",
  "result",
  "no_match",
];

function parseRoomRoundState(value: unknown): RoomRoundState {
  if (!isRecord(value) || !("round" in value)) fail("unexpected");
  if (value.round === null) return { round: null };
  if (!isRecord(value.round)) fail("unexpected");

  const raw = value.round;
  const status = raw.status;
  const candidateCount = raw.candidateCount;
  const myVoteCount = raw.myVoteCount;
  const spinDurationMs = raw.spinDurationMs;
  if (
    typeof raw.id !== "string" ||
    typeof status !== "string" ||
    !ROUND_STATUSES.includes(status as RoomRoundStatus) ||
    typeof candidateCount !== "number" ||
    candidateCount !== 10 ||
    typeof myVoteCount !== "number" ||
    !Number.isInteger(myVoteCount) ||
    myVoteCount < 0 ||
    myVoteCount > candidateCount ||
    typeof raw.partnerCompleted !== "boolean" ||
    typeof spinDurationMs !== "number" ||
    spinDurationMs < 3000 ||
    spinDurationMs > 15000
  ) {
    fail("unexpected");
  }

  const candidates = parseCandidates(raw.candidates);
  if (candidates.length !== candidateCount) fail("unexpected");
  const matchedCandidates = parseCandidates(raw.matchedCandidates);
  const winnerCandidate = raw.winnerCandidate === null ? null : parseCandidate(raw.winnerCandidate);
  const myVotes = parseMyVotes(raw.myVotes, candidates);
  const spinStartedAt = parseIsoDateOrNull(raw.spinStartedAt);

  return {
    round: {
      id: raw.id,
      status: status as RoomRoundStatus,
      candidateCount,
      candidates,
      myVotes,
      myVoteCount,
      partnerCompleted: raw.partnerCompleted,
      matchedCandidates,
      winnerCandidate,
      spinStartedAt,
      spinDurationMs,
    },
  };
}

function parseCandidates(value: unknown): RoomCandidate[] {
  if (!Array.isArray(value)) fail("unexpected");
  return value.map(parseCandidate);
}

function parseCandidate(value: unknown): RoomCandidate {
  if (!isRecord(value)) fail("unexpected");
  const {
    id,
    position,
    tmdbMovieId,
    title,
    originalTitle,
    posterPath,
    overview,
    releaseYear,
    voteAverage,
  } = value;
  if (
    typeof id !== "string" ||
    typeof position !== "number" ||
    !Number.isInteger(position) ||
    position < 1 ||
    position > 10 ||
    typeof tmdbMovieId !== "number" ||
    !Number.isInteger(tmdbMovieId) ||
    tmdbMovieId <= 0 ||
    typeof title !== "string" ||
    title.trim() === "" ||
    (originalTitle !== null && typeof originalTitle !== "string") ||
    (posterPath !== null && (typeof posterPath !== "string" || !posterPath.startsWith("/"))) ||
    (overview !== null && typeof overview !== "string") ||
    (releaseYear !== null && (typeof releaseYear !== "number" || !Number.isInteger(releaseYear))) ||
    (voteAverage !== null && typeof voteAverage !== "number")
  ) {
    fail("unexpected");
  }

  return {
    id,
    position,
    tmdbMovieId,
    title,
    originalTitle,
    posterPath,
    posterUrl: toPosterUrl(posterPath),
    overview,
    releaseYear,
    voteAverage,
  };
}

function parseMyVotes(
  value: unknown,
  candidates: RoomCandidate[],
): Record<string, RoomVoteChoice> {
  if (!isRecord(value)) fail("unexpected");
  const ids = new Set(candidates.map((candidate) => candidate.id));
  const votes: Record<string, RoomVoteChoice> = {};
  for (const [candidateId, choice] of Object.entries(value)) {
    if (!ids.has(candidateId) || (choice !== "skip" && choice !== "maybe" && choice !== "want")) {
      fail("unexpected");
    }
    votes[candidateId] = choice;
  }
  return votes;
}

function parseIsoDateOrNull(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) fail("unexpected");
  return value;
}
