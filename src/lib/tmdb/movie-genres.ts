import "server-only";

import { tmdbRequest } from "./client";
import { TMDB_LANGUAGE } from "./constants";
import { genreLabels } from "./genres";
import { asArray, asNonEmptyString, asPositiveInteger, isRecord } from "./normalize";

/** Tek bir filmin Türkçe tür etiketlerini TMDb'den okur. */
export async function fetchMovieGenreLabels(tmdbMovieId: number): Promise<string[]> {
  const raw = await tmdbRequest(`/movie/${tmdbMovieId}`, { language: TMDB_LANGUAGE });
  if (!isRecord(raw)) return [];
  const ids = asArray(raw.genres)
    .map((genre) => (isRecord(genre) ? asPositiveInteger(genre.id) : null))
    .filter((id): id is number => id !== null);
  return genreLabels(ids, asNonEmptyString(raw.original_language));
}
