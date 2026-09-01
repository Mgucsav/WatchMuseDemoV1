import "server-only";

import { createTtlCache } from "@/lib/ttl-cache";
import { tmdbRequest } from "./client";
import {
  DETAILS_CACHE_MAX_ENTRIES,
  DETAILS_CACHE_TTL_MS,
  TMDB_LANGUAGE,
} from "./constants";
import { TmdbError } from "./errors";
import {
  asArray,
  asFiniteNumber,
  asNonEmptyString,
  asPositiveInteger,
  isRecord,
  toBackdropUrl,
  toPosterUrl,
  toReleaseYear,
} from "./normalize";
import type { MovieDetails } from "./types";

const detailsCache = createTtlCache<MovieDetails>({
  ttlMs: DETAILS_CACHE_TTL_MS,
  maxEntries: DETAILS_CACHE_MAX_ENTRIES,
});

/**
 * TMDb `movie/{id}` künyesini getirir.
 *
 * Ekip bilgisi ayrı bir `movie/{id}/credits` isteği yerine
 * `append_to_response=credits` ile aynı çağrıda alınır: yönetmen için ikinci
 * bir TMDb isteği harcanmaz.
 *
 * `server-only` importu sayesinde bu modül bir istemci bileşeninden import
 * edilemez; token yalnızca `client.ts` içinde okunur ve buraya hiç uğramaz.
 */
export async function getMovieDetails(movieId: number): Promise<MovieDetails> {
  const cacheKey = String(movieId);

  const cached = detailsCache.get(cacheKey);
  if (cached) return cached;

  const raw = await tmdbRequest(`/movie/${movieId}`, {
    language: TMDB_LANGUAGE,
    append_to_response: "credits",
  });

  const details = normalizeMovieDetails(raw, movieId);

  // Kimliği ya da adı okunamayan bir kayıt gösterime uygun değildir. Boş bir
  // iskelet göstermek yerine, uçun 404 olarak sınıflandırdığı açık bir hata
  // verilir.
  if (details === null) {
    throw new TmdbError(
      "not_found",
      "İstenen film TMDb üzerinde bulunamadı.",
    );
  }

  detailsCache.set(cacheKey, details);

  return details;
}

/**
 * Ham TMDb künye yanıtını uygulama modeline çevirir.
 *
 * Saf bir dönüşümdür (I/O yok, hata fırlatmaz). Eksik ya da beklenmedik tipteki
 * alanlar `null` / boş listeye düşer; yalnızca kimlik veya ad okunamıyorsa
 * `null` döner.
 */
export function normalizeMovieDetails(
  raw: unknown,
  requestedMovieId: number,
): MovieDetails | null {
  if (!isRecord(raw)) return null;

  // Kimlik her zaman TMDb ID'sidir. TMDb bir yönlendirme sonucu farklı bir
  // kimlik döndürürse ona uyulur; hiçbiri okunamazsa istenen kimliğe düşülür.
  const id = asPositiveInteger(raw.id) ?? requestedMovieId;

  const title =
    asNonEmptyString(raw.title) ?? asNonEmptyString(raw.original_title);
  if (title === null) return null;

  const originalTitle = asNonEmptyString(raw.original_title);
  const posterPath = asNonEmptyString(raw.poster_path);
  const backdropPath = asNonEmptyString(raw.backdrop_path);
  const voteAverage = asFiniteNumber(raw.vote_average);
  const runtime = asFiniteNumber(raw.runtime);

  return {
    id,
    title,
    // Türkçe ad ile aynıysa tekrar göstermenin anlamı yok.
    originalTitle:
      originalTitle && originalTitle !== title ? originalTitle : null,
    releaseYear: toReleaseYear(raw.release_date),
    posterPath,
    posterUrl: toPosterUrl(posterPath),
    backdropUrl: toBackdropUrl(backdropPath),
    overview: asNonEmptyString(raw.overview),
    // TMDb puanlanmamış filmler için 0 döndürüyor; bunu "puan yok" sayıyoruz.
    voteAverage: voteAverage !== null && voteAverage > 0 ? voteAverage : null,
    // TMDb süresi bilinmeyen filmlerde 0 veya null döndürüyor.
    runtimeMinutes:
      runtime !== null && Number.isInteger(runtime) && runtime > 0
        ? runtime
        : null,
    genres: normalizeGenres(raw.genres),
    director: extractDirector(raw.credits),
  };
}

/** Tür adlarını geldiği sırada, tekilleştirerek çıkarır. */
export function normalizeGenres(raw: unknown): string[] {
  const seen = new Set<string>();
  const genres: string[] = [];

  for (const entry of asArray(raw)) {
    if (!isRecord(entry)) continue;

    const name = asNonEmptyString(entry.name);
    if (name === null || seen.has(name)) continue;

    seen.add(name);
    genres.push(name);
  }

  return genres;
}

/**
 * `credits.crew` içinden yönetmen(ler)i çıkarır.
 *
 * Eşleşme yalnızca `job === "Director"` üzerinden yapılır. `department`
 * ("Directing") bilinçli olarak kullanılmaz: o alan yardımcı yönetmen ve script
 * supervisor gibi rolleri de kapsar ve yanlış isim üretir.
 *
 * Birden fazla yönetmen (ör. kardeş yönetmenler) geldiği sırada, tekilleştirilmiş
 * olarak birleştirilir. Hiçbiri yoksa `null` döner.
 */
export function extractDirector(credits: unknown): string | null {
  if (!isRecord(credits)) return null;

  const seen = new Set<string>();
  const directors: string[] = [];

  for (const entry of asArray(credits.crew)) {
    if (!isRecord(entry)) continue;
    if (asNonEmptyString(entry.job) !== "Director") continue;

    const name = asNonEmptyString(entry.name);
    if (name === null || seen.has(name)) continue;

    seen.add(name);
    directors.push(name);
  }

  return directors.length > 0 ? directors.join(", ") : null;
}
