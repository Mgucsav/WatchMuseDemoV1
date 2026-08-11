import {
  TMDB_IMAGE_BASE_URL,
  TMDB_POSTER_SIZE,
  TMDB_TRUSTED_LINK_HOSTNAMES,
} from "./constants";

/**
 * TMDb yanıtlarını uygulamanın kendi modellerine çeviren savunmacı yardımcılar.
 *
 * TMDb alanları zaman zaman eksik, `null` veya beklenmedik tipte gelebiliyor.
 * Buradaki fonksiyonlar hiçbir koşulda hata fırlatmaz; ayrıştıramadıkları
 * değeri `null` döndürür, böylece beklenmeyen veri uygulamayı çökertmez.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function asPositiveInteger(value: unknown): number | null {
  const numeric = asFiniteNumber(value);
  if (numeric === null || !Number.isInteger(numeric) || numeric <= 0) return null;
  return numeric;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** `"1999-03-31"` → `1999`. Ayrıştırılamazsa `null`. */
export function toReleaseYear(value: unknown): number | null {
  const raw = asNonEmptyString(value);
  if (!raw) return null;

  const year = Number.parseInt(raw.slice(0, 4), 10);
  if (!Number.isInteger(year) || year < 1800 || year > 2200) return null;

  return year;
}

/** TMDb afiş yolunu tam URL'ye çevirir. */
export function toPosterUrl(posterPath: string | null): string | null {
  if (!posterPath || !posterPath.startsWith("/")) return null;
  return `${TMDB_IMAGE_BASE_URL}/${TMDB_POSTER_SIZE}${posterPath}`;
}

/**
 * "İzleme seçenekleri" bağlantısını normalize eder.
 *
 * Yalnızca `https:` şemasına **ve** güvenilen TMDb alan adlarından birine
 * işaret eden mutlak bağlantılar kabul edilir. Böylece beklenmedik veya
 * bozulmuş bir yanıt arayüze rastgele (ör. `javascript:`, `http:` veya
 * üçüncü taraf) bir bağlantı yerleştiremez.
 *
 * Not: TMDb bu alanda kendi yönlendirme sayfasını döndürür; doğrudan bir
 * JustWatch adresi olduğu garanti edilmez.
 */
export function toWatchOptionsUrl(value: unknown): string | null {
  const raw = asNonEmptyString(value);
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (!TMDB_TRUSTED_LINK_HOSTNAMES.includes(url.hostname.toLowerCase())) {
    return null;
  }

  return url.toString();
}
