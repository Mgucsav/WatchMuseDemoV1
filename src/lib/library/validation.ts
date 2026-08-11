/**
 * Kütüphane girdisi doğrulaması.
 *
 * Saf modüldür; doğrudan test edilir. Veritabanı kısıtlarıyla aynı kuralları
 * uygular, böylece hatalı girdi veritabanına hiç ulaşmaz ve kullanıcı anlaşılır
 * bir mesaj görür.
 */

import type { LibraryStatus } from "./types";

export const RATING_MIN = 1;
export const RATING_MAX = 10;
export const NOTE_MAX_LENGTH = 2000;
export const TITLE_MAX_LENGTH = 300;

export function isLibraryStatus(value: unknown): value is LibraryStatus {
  return value === "watchlist" || value === "watched";
}

/** TMDb film ID'si: tam olarak pozitif, güvenli bir tam sayı. */
export function parseTmdbMovieId(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  if (typeof value !== "string") return null;
  if (!/^[0-9]+$/.test(value)) return null;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  if (String(parsed) !== value) return null;

  return parsed;
}

/** 1–10 arası tam sayı ya da `null`. Boş dize "puan yok" demektir. */
export function parseRating(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "") return null;

  const numeric =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;

  if (!Number.isInteger(numeric)) return undefined;
  if (numeric < RATING_MIN || numeric > RATING_MAX) return undefined;

  return numeric;
}

/** Not metni. Çok uzunsa `undefined` (geçersiz) döner. */
export function parseNote(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.length > NOTE_MAX_LENGTH) return undefined;

  return trimmed;
}

/** Film adı; kısıt gereği 1–300 karakter. */
export function parseMovieTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed === "") return null;

  return trimmed.slice(0, TITLE_MAX_LENGTH);
}

/**
 * TMDb afiş yolu.
 *
 * Veritabanı kısıtıyla aynı biçim uygulanır; böylece arayüze rastgele bir
 * adres yerleştirilemez.
 */
export function parsePosterPath(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed === "") return null;

  return /^\/[A-Za-z0-9._-]+$/.test(trimmed) ? trimmed : null;
}
