import type { TargetProviderKey } from "./types";

export const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";
export const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

/**
 * `watch/providers` yanıtındaki `link` alanının işaret etmesine izin verilen
 * alan adları.
 *
 * TMDb bu alanda kendi yönlendirme sayfasını döndürür (JustWatch'a doğrudan
 * bağlantı değildir ve garanti edilmez). Beklenmedik bir yanıtın arayüze
 * rastgele bir bağlantı yerleştirmesini engellemek için allowlist uygulanır.
 */
export const TMDB_TRUSTED_LINK_HOSTNAMES: readonly string[] = [
  "www.themoviedb.org",
  "themoviedb.org",
];

/** Afiş boyutu. `next.config.ts` içindeki remotePatterns bu alan adını kapsar. */
export const TMDB_POSTER_SIZE = "w342";

/**
 * Detay görünümündeki arka plan görseli boyutu.
 *
 * Aynı `image.tmdb.org/t/p/**` deseni altında kaldığı için `next.config.ts`
 * içinde ek bir remote pattern gerekmez.
 */
export const TMDB_BACKDROP_SIZE = "w780";

export const TMDB_LANGUAGE = "tr-TR";
export const TMDB_REGION = "TR";

/** Tek bir TMDb isteği için üst sınır. */
export const TMDB_REQUEST_TIMEOUT_MS = 8_000;

/**
 * Katalog verisi anlık değişmediği için sağlayıcı sonuçları 6 saat saklanır.
 * Arama sonuçları daha da durağandır ama gereksiz bellek tutmamak için kısa tutuldu.
 */
export const PROVIDER_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const SEARCH_CACHE_TTL_MS = 30 * 60 * 1000;

/**
 * Film künyesi (süre, tür, yönetmen) pratikte hiç değişmez; yayın sonrası
 * düzeltmeleri yakalayabilmek için yine de sınırlı tutuldu.
 */
export const DETAILS_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export const PROVIDER_CACHE_MAX_ENTRIES = 500;
export const SEARCH_CACHE_MAX_ENTRIES = 200;
export const DETAILS_CACHE_MAX_ENTRIES = 300;

interface TargetProviderDefinition {
  key: TargetProviderKey;
  label: string;
  /**
   * Eşleşme yalnızca bu ID'ler üzerinden yapılır; sağlayıcı adında metin
   * araması yapılmaz. Reklamlı paketler de aynı aboneliğe dahil sayıldığı için
   * listeye eklenmiştir.
   */
  tmdbProviderIds: readonly number[];
}

/**
 * Hedef platformların TMDb (JustWatch) provider ID'leri.
 * Yeni bir platform eklemek veya bir ID'yi güncellemek için tek değişiklik noktası burasıdır.
 */
export const TARGET_PROVIDERS: readonly TargetProviderDefinition[] = [
  {
    key: "netflix",
    label: "Netflix",
    tmdbProviderIds: [
      8, // Netflix
      1796, // Netflix Standard with Ads
    ],
  },
  {
    key: "prime_video",
    label: "Amazon Prime Video",
    tmdbProviderIds: [
      119, // Amazon Prime Video
      2100, // Amazon Prime Video with Ads
    ],
  },
  {
    key: "apple_tv_plus",
    label: "Apple TV+",
    // Yalnızca abonelik servisi (Apple TV+). Apple TV üzerinden kiralama/satın
    // alma (provider 2) bilinçli olarak listede yoktur: aboneliğe dahil değildir.
    tmdbProviderIds: [350],
  },
  {
    key: "disney_plus",
    label: "Disney+",
    tmdbProviderIds: [337],
  },
  {
    key: "blutv",
    label: "BluTV",
    tmdbProviderIds: [341],
  },
  {
    key: "mubi",
    label: "MUBI",
    tmdbProviderIds: [11],
  },
] as const;
