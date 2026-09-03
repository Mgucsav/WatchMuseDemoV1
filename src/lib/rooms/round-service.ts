import "server-only";

import { toPosterUrl } from "@/lib/tmdb/normalize";
import type { MovieDetails, MovieSummary, TargetProviderKey } from "@/lib/tmdb/types";
import {
  SupabaseAdminNotConfiguredError,
  createSupabaseAdminClient,
} from "@/lib/supabase/admin";
import {
  createSupabaseServerClient,
  getAuthenticatedUserId,
} from "@/lib/supabase/server";
import { isLocalRoomsBackend } from "./backend";
import type { RoundCandidatePlan } from "./candidate-pipeline";
import { normalizeRoomError, roomError } from "./errors";
import { RoomServiceError } from "./service";
import { parseTelepartyJoinUrl } from "./teleparty";
import { isRecord } from "./validation";
import type {
  RoomCandidate,
  RoomSelection,
  RoomRoundState,
  RoomRoundStatus,
  RoomTelepartyState,
  RoomVoteChoice,
} from "./types";

function fail(code: Parameters<typeof roomError>[0]): never {
  throw new RoomServiceError(roomError(code));
}

async function getRpcClient() {
  if (isLocalRoomsBackend()) fail("round_requires_supabase");

  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) fail("not_configured");

  return supabase;
}

async function getClientAndUser() {
  const supabase = await getRpcClient();

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

/** Geçmişi silmeden bir sonraki turu ve kesin aday sırasını atomik başlatır. */
/**
 * Doğrulanmış çağıranın bu odanın katılımcısı olduğunu kanıtlar.
 *
 * Kullanıcının KENDİ oturumuyla ve RLS altında çalışır: `participants` üzerinde
 * yalnızca aynı odanın üyeleri okunabilir. Güvenilen kalıcılaştırma yolu ancak
 * bu kontrol geçtikten sonra çağrılır ve doğrulanmış aktör kimliği RPC'ye
 * açıkça geçilir; veritabanı fonksiyonu üyeliği ayrıca kendi içinde de
 * doğrular (savunma derinliği).
 */
async function requireSpaceMember(spaceId: string): Promise<string> {
  const supabase = await getClientAndUser();

  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) fail("unauthenticated");

  const { data, error } = await supabase
    .from("participants")
    .select("user_id")
    .eq("space_id", spaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new RoomServiceError(normalizeRoomError(error));
  // Üyelik yoksa odanın varlığı bile sızdırılmaz.
  if (!data) fail("invalid_invitation");

  return userId;
}

/**
 * Aday planını GÜVENİLEN sunucu yolundan kalıcılaştırır (RR-02).
 *
 * Sıra önemlidir:
 *   1. Çağıran kullanıcının kendi oturumuyla doğrulanır ve üyeliği kanıtlanır.
 *   2. Ancak ondan sonra service-role istemcisiyle RPC çağrılır.
 *   3. Aktör kimliği RPC'ye açıkça geçilir; SQL fonksiyonu onu bağımsız doğrular.
 *
 * Aday listesi, seed, policy/ranker sürümü ve ortak abonelik kümesi tarayıcıdan
 * DEĞİL, bu süreçteki `candidate-pipeline` ve oda durumundan üretilir.
 *
 * `p_provider_keys` turla birlikte saklanır. Veritabanı bir filmin gerçekten o
 * platformlarda olduğunu doğrulayamaz (TMDb katalog bilgisi orada yoktur);
 * filtre keşif isteğinde uygulanır. Saklanan küme, sonraki turlarda GEÇMİŞTEN
 * tekrar aday alınırken kullanılır: yalnızca bugünün ortak kümesinin alt
 * kümesiyle toplanmış turlar tekrar edilebilir.
 */
export async function startNextRoomRound(
  spaceId: string,
  plan: RoundCandidatePlan,
): Promise<void> {
  if (plan.candidates.length < 10 || plan.candidates.length > 200) {
    fail("invalid_candidates");
  }

  // Ortak abonelik olmadan aday havuzu toplanamaz; buraya boş liste gelmesi
  // sağlayıcı filtresinin atlandığı anlamına gelirdi.
  if (plan.providerKeys.length === 0) fail("no_shared_subscriptions");

  const actorId = await requireSpaceMember(spaceId);

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (error) {
    if (error instanceof SupabaseAdminNotConfiguredError) fail("not_configured");
    throw error;
  }

  const { error } = await admin.rpc("start_next_space_round", {
    p_space_id: spaceId,
    p_actor_id: actorId,
    p_candidates: serializedCandidates(plan.candidates),
    p_selection_seed: plan.seed,
    p_policy_version: plan.selectionPolicyVersion,
    p_ranker_version: plan.rankerVersion,
    p_allow_eligible_repeats: plan.allowEligibleRepeats,
    p_provider_keys: plan.providerKeys,
  });

  if (error) throw new RoomServiceError(normalizeRoomError(error));
}

/**
 * Belirlenmiş-film odasında hostun doğrulanmış TMDb filmini doğrudan oda
 * seçimi olarak başlatır. Kalıcılaştırma yalnız service-role RPC'sindedir;
 * tarayıcı film künyesini veya sağlayıcı kümesini dayatamaz.
 */
export async function startDirectRoomSelection(
  spaceId: string,
  movie: MovieDetails,
  providerKeys: TargetProviderKey[],
): Promise<void> {
  if (providerKeys.length === 0) fail("movie_not_on_shared_provider");

  const actorId = await requireSpaceMember(spaceId);

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (error) {
    if (error instanceof SupabaseAdminNotConfiguredError) fail("not_configured");
    throw error;
  }

  const { error } = await admin.rpc("start_direct_space_selection", {
    p_space_id: spaceId,
    p_actor_id: actorId,
    p_movie: {
      tmdbMovieId: movie.id,
      title: movie.title,
      originalTitle: movie.originalTitle,
      posterPath: movie.posterPath,
      overview: movie.overview,
      releaseYear: movie.releaseYear,
      voteAverage: movie.voteAverage,
    },
    p_provider_keys: providerKeys,
  });

  if (error) throw new RoomServiceError(normalizeRoomError(error));
}

export async function acceptRoomSelection(
  spaceId: string,
  selectionId: string,
): Promise<void> {
  const supabase = await getClientAndUser();
  const { error } = await supabase.rpc("accept_room_selection", {
    p_space_id: spaceId,
    p_selection_id: selectionId,
  });
  if (error) throw new RoomServiceError(normalizeRoomError(error));
}

/** İki taraf hazır olduktan sonra hostun Teleparty davetini güvenle paylaşır. */
export async function shareRoomTelepartyLink(
  spaceId: string,
  selectionId: string,
  joinUrl: string,
): Promise<void> {
  const canonicalUrl = parseTelepartyJoinUrl(joinUrl);
  if (!canonicalUrl) fail("invalid_teleparty_link");

  const supabase = await getClientAndUser();
  const { error } = await supabase.rpc("share_room_teleparty_link", {
    p_space_id: spaceId,
    p_selection_id: selectionId,
    p_join_url: canonicalUrl,
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
  const [roundResult, telepartyResult] = await Promise.all([
    supabase.rpc("get_space_round_state", { p_space_id: spaceId }),
    supabase.rpc("get_space_teleparty_state", { p_space_id: spaceId }),
  ]);
  if (roundResult.error) {
    throw new RoomServiceError(normalizeRoomError(roundResult.error));
  }
  if (telepartyResult.error) {
    throw new RoomServiceError(normalizeRoomError(telepartyResult.error));
  }

  return {
    ...parseRoomRoundState(roundResult.data),
    telepartyStates: parseRoomTelepartyStates(telepartyResult.data),
  };
}

/** Tur ve aday gövdesini taşımadan yalnız ortak Teleparty durumunu okur. */
export async function getRoomTelepartyStates(
  spaceId: string,
): Promise<RoomTelepartyState[]> {
  // Bu sık çağrılan hafif yol ek bir auth.getUser ağ turu yapmaz. Supabase JWT'yi
  // doğrular; SECURITY DEFINER RPC de auth.uid() ve oda üyeliğini kendi içinde
  // yeniden denetler.
  const supabase = await getRpcClient();
  const { data, error } = await supabase.rpc("get_space_teleparty_state", {
    p_space_id: spaceId,
  });
  if (error) throw new RoomServiceError(normalizeRoomError(error));
  return parseRoomTelepartyStates(data);
}

const ROUND_STATUSES: readonly RoomRoundStatus[] = [
  "voting",
  "matching",
  "spinning",
  "result",
  "no_match",
];

export function parseRoomRoundState(value: unknown): RoomRoundState {
  assertNoPersonSpecificFields(value);
  if (
    !isRecord(value) ||
    !("round" in value) ||
    !("pendingSelections" in value)
  ) fail("unexpected");
  const pendingSelections = parseSelections(value.pendingSelections);
  if (value.round === null) {
    return { round: null, pendingSelections, telepartyStates: [] };
  }
  if (!isRecord(value.round)) fail("unexpected");

  const raw = value.round;
  const status = raw.status;
  const candidateCount = raw.candidateCount;
  const myVoteCount = raw.myVoteCount;
  const spinDurationMs = raw.spinDurationMs;
  if (
    typeof raw.id !== "string" ||
    typeof raw.roundNumber !== "number" ||
    !Number.isInteger(raw.roundNumber) ||
    raw.roundNumber < 1 ||
    typeof status !== "string" ||
    !ROUND_STATUSES.includes(status as RoomRoundStatus) ||
    typeof candidateCount !== "number" ||
    (candidateCount !== 1 && candidateCount !== 10) ||
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
      roundNumber: raw.roundNumber,
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
    pendingSelections,
    telepartyStates: [],
  };
}

export function parseRoomTelepartyStates(value: unknown): RoomTelepartyState[] {
  if (!Array.isArray(value)) fail("unexpected");

  const states = value.map((raw): RoomTelepartyState => {
    if (
      !isRecord(raw) ||
      typeof raw.selectionId !== "string" ||
      typeof raw.bothAccepted !== "boolean" ||
      (raw.joinUrl !== null && typeof raw.joinUrl !== "string")
    ) {
      fail("unexpected");
    }

    const joinUrl =
      raw.joinUrl === null ? null : parseTelepartyJoinUrl(raw.joinUrl);
    if (raw.joinUrl !== null && joinUrl === null) fail("unexpected");
    if (!raw.bothAccepted && joinUrl !== null) fail("unexpected");

    return {
      selectionId: raw.selectionId,
      bothAccepted: raw.bothAccepted,
      joinUrl,
    };
  });

  if (new Set(states.map((state) => state.selectionId)).size !== states.length) {
    fail("unexpected");
  }
  return states;
}

const FORBIDDEN_RESPONSE_FIELDS = new Set([
  "acceptedByUserId",
  "partnerAccepted",
  "partnerLibrary",
  "partnerVotes",
  "userId",
  "voteCounts",
  "signalCounts",
]);

function assertNoPersonSpecificFields(value: unknown): void {
  if (Array.isArray(value)) {
    for (const entry of value) assertNoPersonSpecificFields(entry);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_RESPONSE_FIELDS.has(key)) fail("unexpected");
    assertNoPersonSpecificFields(entry);
  }
}

function parseSelections(value: unknown): RoomSelection[] {
  if (!Array.isArray(value)) fail("unexpected");
  return value.map((raw): RoomSelection => {
    if (!isRecord(raw)) fail("unexpected");
    const posterPath = raw.posterPath;
    if (
      typeof raw.id !== "string" ||
      typeof raw.tmdbMovieId !== "number" ||
      !Number.isInteger(raw.tmdbMovieId) ||
      raw.tmdbMovieId <= 0 ||
      typeof raw.title !== "string" ||
      raw.title.trim() === "" ||
      (posterPath !== null &&
        (typeof posterPath !== "string" || !posterPath.startsWith("/"))) ||
      typeof raw.selectedAt !== "string" ||
      Number.isNaN(Date.parse(raw.selectedAt)) ||
      typeof raw.responseDeadline !== "string" ||
      Number.isNaN(Date.parse(raw.responseDeadline)) ||
      typeof raw.myAccepted !== "boolean"
    ) fail("unexpected");

    return {
      id: raw.id,
      tmdbMovieId: raw.tmdbMovieId,
      title: raw.title,
      posterPath,
      posterUrl: toPosterUrl(posterPath),
      selectedAt: raw.selectedAt,
      responseDeadline: raw.responseDeadline,
      myAccepted: raw.myAccepted,
    };
  });
}

function parseCandidates(value: unknown): RoomCandidate[] {
  if (!Array.isArray(value)) fail("unexpected");
  const candidates = value.map(parseCandidate);
  if (
    new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length ||
    new Set(candidates.map((candidate) => candidate.tmdbMovieId)).size !== candidates.length ||
    new Set(candidates.map((candidate) => candidate.position)).size !== candidates.length
  ) fail("unexpected");
  return candidates;
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
