import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchMovieGenreLabels } from "@/lib/tmdb/movie-genres";

import {
  rankCandidateSource,
  type CandidateRanker,
} from "./candidate-pipeline";
import {
  buildGenreAffinity,
  rankByTaste,
  SIGNAL_WEIGHTS,
  TASTE_RANKER_VERSION,
  type GenreAffinity,
  type TasteSignal,
} from "./taste";

/** Bir turda TMDb'den türü çekilecek en fazla film (gerisi sonraki turlarda). */
const MAX_GENRE_FETCHES = 40;
const GENRE_FETCH_CONCURRENCY = 8;

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Odadaki herkesin zevk profilini kurar ve bir sıralayıcı döndürür.
 *
 * Kütüphane ve oylar yalnız sunucuda, service role ile okunur; hiçbir
 * katılımcının oyu veya puanı istemciye ya da diğer katılımcıya gitmez.
 * Veri yoksa ya da herhangi bir adım başarısız olursa null döner ve tur
 * seed'li rastgele sıralamayla başlar: zevk modeli tur açmayı engellemez.
 */
export async function loadRoomTasteRanker(spaceId: string): Promise<CandidateRanker | null> {
  try {
    const admin = createSupabaseAdminClient();
    const userIds = await participantIds(admin, spaceId);
    if (userIds.length === 0) return null;

    const signalsByUser = await loadSignals(admin, userIds);
    const movieIds = [...new Set([...signalsByUser.values()].flat().map((s) => s.tmdbMovieId))];
    if (movieIds.length === 0) return null;

    const genresByMovie = await loadGenres(admin, movieIds);
    const affinities: GenreAffinity[] = userIds.map((userId) =>
      buildGenreAffinity(signalsByUser.get(userId) ?? [], genresByMovie),
    );
    if (affinities.every((affinity) => affinity.size === 0)) return null;

    return {
      version: TASTE_RANKER_VERSION,
      rank: (source, seed) => rankByTaste(source, affinities, seed) ?? rankCandidateSource(source, seed),
    };
  } catch {
    return null;
  }
}

async function participantIds(admin: Admin, spaceId: string): Promise<string[]> {
  const { data, error } = await admin.from("participants").select("user_id").eq("space_id", spaceId);
  if (error || !data) return [];
  return data.map((row) => row.user_id).filter((id): id is string => typeof id === "string");
}

async function loadSignals(admin: Admin, userIds: string[]): Promise<Map<string, TasteSignal[]>> {
  const signals = new Map<string, TasteSignal[]>(userIds.map((id) => [id, []]));
  const push = (userId: unknown, tmdbMovieId: unknown, weight: number) => {
    if (typeof userId !== "string" || typeof tmdbMovieId !== "number") return;
    signals.get(userId)?.push({ tmdbMovieId, weight });
  };

  const [library, votes] = await Promise.all([
    admin
      .from("library_items")
      .select("user_id, tmdb_movie_id, status, rating")
      .in("user_id", userIds)
      .order("updated_at", { ascending: false })
      .limit(400),
    admin
      .from("room_votes")
      .select("user_id, choice, candidate_id")
      .in("user_id", userIds)
      .order("updated_at", { ascending: false })
      .limit(600),
  ]);

  for (const item of library.data ?? []) {
    const weight =
      item.status === "watched"
        ? typeof item.rating === "number"
          ? SIGNAL_WEIGHTS.rating(item.rating)
          : SIGNAL_WEIGHTS.watchedUnrated
        : SIGNAL_WEIGHTS.watchlist;
    push(item.user_id, item.tmdb_movie_id, weight);
  }

  const voteRows = votes.data ?? [];
  const candidateIds = [...new Set(voteRows.map((vote) => vote.candidate_id).filter(Boolean))];
  if (candidateIds.length > 0) {
    const { data: candidates } = await admin
      .from("room_candidates")
      .select("id, tmdb_movie_id")
      .in("id", candidateIds);
    const movieByCandidate = new Map((candidates ?? []).map((row) => [row.id, row.tmdb_movie_id]));
    for (const vote of voteRows) {
      const choice = vote.choice as keyof typeof SIGNAL_WEIGHTS.vote;
      const weight = SIGNAL_WEIGHTS.vote[choice];
      if (weight !== undefined) push(vote.user_id, movieByCandidate.get(vote.candidate_id), weight);
    }
  }
  return signals;
}

/** Önbellekteki türler; eksik olanlar TMDb'den çekilip önbelleğe yazılır. */
async function loadGenres(admin: Admin, movieIds: number[]): Promise<Map<number, string[]>> {
  const genres = new Map<number, string[]>();
  const { data } = await admin
    .from("movie_genres")
    .select("tmdb_movie_id, genres")
    .in("tmdb_movie_id", movieIds);
  for (const row of data ?? []) {
    if (typeof row.tmdb_movie_id === "number" && Array.isArray(row.genres)) {
      genres.set(row.tmdb_movie_id, row.genres);
    }
  }

  const missing = movieIds.filter((id) => !genres.has(id)).slice(0, MAX_GENRE_FETCHES);
  const fetched: { tmdb_movie_id: number; genres: string[]; updated_at: string }[] = [];
  for (let index = 0; index < missing.length; index += GENRE_FETCH_CONCURRENCY) {
    const batch = missing.slice(index, index + GENRE_FETCH_CONCURRENCY);
    const results = await Promise.allSettled(batch.map((id) => fetchMovieGenreLabels(id)));
    results.forEach((result, position) => {
      if (result.status !== "fulfilled") return;
      const id = batch[position];
      genres.set(id, result.value);
      // Türü olmayan filmler de yazılır ki her turda tekrar sorulmasın.
      fetched.push({ tmdb_movie_id: id, genres: result.value.slice(0, 10), updated_at: new Date().toISOString() });
    });
  }
  if (fetched.length > 0) {
    await admin.from("movie_genres").upsert(fetched, { onConflict: "tmdb_movie_id" });
  }
  return genres;
}
