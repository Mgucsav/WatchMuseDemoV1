/**
 * Sunucu ve istemci tarafında ortak kullanılan sabitler.
 * Burada gizli bilgi bulunmaz; bu dosya istemci paketine dahil olabilir.
 */

/** Bu uzunluğun altındaki aramalar için TMDb'ye istek gönderilmez. */
export const SEARCH_MIN_QUERY_LENGTH = 2;

/** Arama alanındaki tuş vuruşları için bekleme süresi (ms). */
export const SEARCH_DEBOUNCE_MS = 375;
