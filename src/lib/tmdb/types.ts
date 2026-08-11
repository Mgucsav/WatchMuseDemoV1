/**
 * Uygulamanın kendi response modelleri.
 *
 * TMDb yanıtları hiçbir zaman doğrudan arayüze geçirilmez; `normalize.ts`
 * içindeki fonksiyonlar ham veriyi bu tiplere dönüştürür.
 *
 * Bu dosya yalnızca tip içerir, derleme sırasında tamamen silinir; bu yüzden
 * istemci bileşenlerinden de güvenle import edilebilir.
 */

/** Bu aşamada kontrol edilen abonelik platformları. */
export type TargetProviderKey = "netflix" | "prime_video";

/** Arama sonucunda arayüze gönderilen tek bir film. */
export interface MovieSummary {
  /** TMDb film ID'si. Sağlayıcı sorgusunda bu değer kullanılır. */
  id: number;
  title: string;
  /** Türkçe ad ile farklıysa dolu, aksi halde `null`. */
  originalTitle: string | null;
  releaseYear: number | null;
  /**
   * TMDb'nin ham afiş yolu (`/abc.jpg`).
   * Kişisel kütüphane bu değeri saklar: afiş boyutundan bağımsız ve kalıcıdır.
   */
  posterPath: string | null;
  /** Doğrudan kullanılabilir tam afiş URL'si. */
  posterUrl: string | null;
  overview: string | null;
  /** TMDb puanı (0-10). Puanlanmamış filmlerde `null`. */
  voteAverage: number | null;
}

export interface MovieSearchResult {
  query: string;
  page: number;
  totalResults: number;
  results: MovieSummary[];
}

/** Hedef platformlardan birinin Türkiye abonelik durumu. */
export interface ProviderAvailability {
  key: TargetProviderKey;
  label: string;
  /** Yalnızca `flatrate` listesindeki TMDb provider ID eşleşmesine dayanır. */
  available: boolean;
  /** Eşleşen TMDb provider ID'si (ör. reklamlı paket varyantı). */
  matchedProviderId: number | null;
}

export interface FlatrateProvider {
  id: number;
  name: string;
}

export interface MovieProvidersResult {
  movieId: number;
  /** Şimdilik her zaman "TR". */
  region: string;
  /**
   * TMDb'de bu film için Türkiye kaydı var mı?
   * `false` ise arayüz "Bilgi mevcut değil" durumunu gösterir; bu bir hata değildir.
   */
  hasRegionData: boolean;
  providers: ProviderAvailability[];
  /** TR'de abonelikle sunan, hedef dışındaki diğer platformlar. */
  otherFlatrateProviders: FlatrateProvider[];
  /**
   * TMDb'nin `watch/providers` yanıtındaki bölge bağlantısı: filmin izleme
   * seçeneklerini listeleyen TMDb sayfası.
   *
   * Doğrudan bir JustWatch adresi **değildir** ve öyle olduğu garanti edilmez;
   * TMDb kendi yönlendirme sayfasını döndürür. Yalnızca güvenilen TMDb alan
   * adlarına izin verilir (bkz. `toWatchOptionsUrl`).
   */
  watchOptionsUrl: string | null;
  /** Sunucu tarafında üretilen ISO 8601 zaman damgası. */
  checkedAt: string;
}

/** Tüm API uçlarının ortak hata gövdesi. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}
