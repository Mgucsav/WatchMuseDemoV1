import "server-only";

import { createTtlCache } from "@/lib/ttl-cache";
import { tmdbRequest } from "./client";
import {
  SEARCH_CACHE_MAX_ENTRIES,
  SEARCH_CACHE_TTL_MS,
  TMDB_LANGUAGE,
} from "./constants";
import {
  asArray,
  asFiniteNumber,
  asNonEmptyString,
  asPositiveInteger,
  isRecord,
  toPosterUrl,
  toReleaseYear,
} from "./normalize";
import type { MovieSearchResult, MovieSummary } from "./types";

const searchCache = createTtlCache<MovieSearchResult>({
  ttlMs: SEARCH_CACHE_TTL_MS,
  maxEntries: SEARCH_CACHE_MAX_ENTRIES,
});

/**
 * TMDb `search/movie` üzerinden film arar.
 *
 * Yalnızca ilk sonuç sayfası getirilir ve arayüze gereken alanlar döndürülür.
 * Ham TMDb yanıtı hiçbir zaman dışarı verilmez.
 */
export async function searchMovies(query: string): Promise<MovieSearchResult> {
  const normalizedQuery = query.trim();
  const cacheKey = normalizedQuery.toLocaleLowerCase("tr-TR");

  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const raw = await tmdbRequest("/search/movie", {
    query: normalizedQuery,
    language: TMDB_LANGUAGE,
    include_adult: "false",
    page: "1",
  });

  const result = normalizeSearchResponse(raw, normalizedQuery);
  searchCache.set(cacheKey, result);

  return result;
}

function normalizeSearchResponse(
  raw: unknown,
  query: string,
): MovieSearchResult {
  const root = isRecord(raw) ? raw : {};

  const results = asArray(root.results)
    .map(normalizeMovie)
    .filter((movie): movie is MovieSummary => movie !== null);

  return {
    query,
    page: asPositiveInteger(root.page) ?? 1,
    totalResults: asFiniteNumber(root.total_results) ?? results.length,
    results,
  };
}

/** Kimliği veya adı okunamayan kayıtlar listeden düşürülür. */
function normalizeMovie(raw: unknown): MovieSummary | null {
  if (!isRecord(raw)) return null;

  const id = asPositiveInteger(raw.id);
  if (id === null) return null;

  const title = asNonEmptyString(raw.title) ?? asNonEmptyString(raw.original_title);
  if (title === null) return null;

  const originalTitle = asNonEmptyString(raw.original_title);
  const posterPath = asNonEmptyString(raw.poster_path);
  const voteAverage = asFiniteNumber(raw.vote_average);

  return {
    id,
    title,
    // Türkçe ad ile aynıysa tekrar göstermenin anlamı yok.
    originalTitle: originalTitle && originalTitle !== title ? originalTitle : null,
    releaseYear: toReleaseYear(raw.release_date),
    posterPath,
    posterUrl: toPosterUrl(posterPath),
    overview: asNonEmptyString(raw.overview),
    // TMDb puanlanmamış filmler için 0 döndürüyor; bunu "puan yok" sayıyoruz.
    voteAverage: voteAverage !== null && voteAverage > 0 ? voteAverage : null,
  };
}
