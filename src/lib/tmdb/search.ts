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
 * DİL DAVRANIŞI — Türkçe ve İngilizce arama aynı filmi vermelidir.
 *
 * TMDb'nin `query` eşleştirmesi, filmin TÜM başlık çevirileri ve alternatif
 * adları üzerinde çalışır; `language` parametresi hangi filmlerin eşleştiğini
 * DEĞİL, dönen üstverinin (başlık, özet) dilini belirler. Yani "Inception" da
 * "Başlangıç" da aynı TMDb kaydına ulaşır.
 *
 * Bu yüzden dil TEK ve SABİTTİR (`tr-TR`). Daha önce sorgudaki Türkçe
 * karakterlere bakıp iki farklı dille iki ayrı istek atan bir mantık vardı;
 * bu üç soruna yol açıyordu:
 *   1. Aynı film, sorgunun diline göre farklı başlıkla görünüyordu.
 *   2. Sonuçsuz her arama TMDb'ye ikinci bir istek atıyor, kotayı ikiye
 *      katlıyordu.
 *   3. Sonuç kullanıcı açısından öngörülemez oluyordu.
 *
 * Türkçe çevirisi olmayan filmlerde TMDb zaten orijinal başlığı döndürür;
 * ayrıca `originalTitle` alanı arayüzde gösterildiği için İngilizce ad da
 * her zaman görünür kalır.
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
export function normalizeMovie(raw: unknown): MovieSummary | null {
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

/**
 * Oda için sunucuda bir kez aday film havuzu üretir.
 *
 * Bu fonksiyon istemciye doğrudan açık değildir: çağıran sunucu kodu sonucu
 * veritabanına kaydeder; böylece iki kullanıcıya aynı 10 ID ve aynı sıra gider.
 */
export async function discoverRoomCandidatePage(
  page: number,
): Promise<MovieSummary[]> {
  if (!Number.isInteger(page) || page < 1 || page > 500) {
    throw new Error("invalid_discover_page");
  }

  const raw = await tmdbRequest("/discover/movie", {
    language: TMDB_LANGUAGE,
    include_adult: "false",
    include_video: "false",
    sort_by: "popularity.desc",
    "vote_count.gte": "50",
    page: String(page),
  });

  const unique = new Map<number, MovieSummary>();
  for (const entry of asArray(isRecord(raw) ? raw.results : undefined)) {
    const movie = normalizeMovie(entry);
    if (movie && !unique.has(movie.id)) unique.set(movie.id, movie);
  }

  if (unique.size === 0) {
    throw new Error("room_candidate_pool_incomplete");
  }

  return [...unique.values()];
}
