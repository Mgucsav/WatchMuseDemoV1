import "server-only";

import { createTtlCache } from "@/lib/ttl-cache";
import { tmdbRequest } from "./client";
import {
  PROVIDER_CACHE_MAX_ENTRIES,
  PROVIDER_CACHE_TTL_MS,
  TARGET_PROVIDERS,
  TMDB_REGION,
} from "./constants";
import {
  asArray,
  asNonEmptyString,
  asPositiveInteger,
  isRecord,
  toWatchOptionsUrl,
} from "./normalize";
import type {
  FlatrateProvider,
  MovieProvidersResult,
  ProviderAvailability,
} from "./types";

const providerCache = createTtlCache<MovieProvidersResult>({
  ttlMs: PROVIDER_CACHE_TTL_MS,
  maxEntries: PROVIDER_CACHE_MAX_ENTRIES,
});

/**
 * TMDb `movie/{id}/watch/providers` üzerinden Türkiye abonelik durumunu getirir.
 *
 * Sınıflandırma kuralı: yalnızca `results.TR.flatrate` listesi aboneliğe dahil
 * sayılır. `rent` ve `buy` girişleri kasıtlı olarak yok sayılır — bunlar ayrı
 * ücret gerektirir ve "aboneliğe dahil" anlamına gelmez.
 */
export async function getMovieWatchProviders(
  movieId: number,
): Promise<MovieProvidersResult> {
  const cacheKey = String(movieId);

  const cached = providerCache.get(cacheKey);
  if (cached) return cached;

  const raw = await tmdbRequest(`/movie/${movieId}/watch/providers`);
  const result = normalizeProvidersResponse(raw, movieId);

  providerCache.set(cacheKey, result);

  return result;
}

/**
 * Ham TMDb `watch/providers` yanıtını uygulama modeline çevirir.
 *
 * Saf bir dönüşümdür (I/O yok, hata fırlatmaz); sınıflandırma kuralının
 * doğrudan test edilebilmesi için dışa aktarılmıştır.
 */
export function normalizeProvidersResponse(
  raw: unknown,
  movieId: number,
): MovieProvidersResult {
  const root = isRecord(raw) ? raw : {};
  const results = isRecord(root.results) ? root.results : {};

  // Yalnızca Türkiye kaydı incelenir; diğer ülkeler tamamen yok sayılır.
  const regionData = isRecord(results[TMDB_REGION]) ? results[TMDB_REGION] : null;

  const flatrate = regionData ? normalizeFlatrate(regionData.flatrate) : [];
  const flatrateIds = new Set(flatrate.map((provider) => provider.id));

  const providers: ProviderAvailability[] = TARGET_PROVIDERS.map((target) => {
    // Eşleşme yalnızca provider ID üzerinden; sağlayıcı adına bakılmaz.
    const matchedProviderId =
      target.tmdbProviderIds.find((id) => flatrateIds.has(id)) ?? null;

    return {
      key: target.key,
      label: target.label,
      available: matchedProviderId !== null,
      matchedProviderId,
    };
  });

  const targetIds = new Set(
    TARGET_PROVIDERS.flatMap((target) => target.tmdbProviderIds),
  );

  return {
    movieId,
    region: TMDB_REGION,
    hasRegionData: regionData !== null,
    providers,
    otherFlatrateProviders: flatrate.filter(
      (provider) => !targetIds.has(provider.id),
    ),
    watchOptionsUrl: regionData ? toWatchOptionsUrl(regionData.link) : null,
    // Zaman damgası her zaman sunucuda üretilir.
    checkedAt: new Date().toISOString(),
  };
}

function normalizeFlatrate(raw: unknown): FlatrateProvider[] {
  const seen = new Set<number>();
  const providers: FlatrateProvider[] = [];

  for (const entry of asArray(raw)) {
    if (!isRecord(entry)) continue;

    const id = asPositiveInteger(entry.provider_id);
    if (id === null || seen.has(id)) continue;

    seen.add(id);
    providers.push({
      id,
      name: asNonEmptyString(entry.provider_name) ?? `Sağlayıcı #${id}`,
    });
  }

  return providers;
}
