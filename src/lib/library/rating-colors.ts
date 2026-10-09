/**
 * 1–10 puanın rengi: kırmızıdan (beğenmedim) sarıdan geçerek yeşile (çok
 * beğendim). Her puanın kendi tonu vardır ki yan yana ayırt edilebilsin.
 *
 * - 1–4 kırmızı: 1 en koyu, 4'e doğru açılır.
 * - 5–7 sarı: 5 kahveye yakın, 6 amber, 7 sarıya yakın.
 * - 8–10 yeşil: 8 sarı-yeşil, 10 en canlı yeşil.
 *
 * Siyah zeminde (#0b0b0b) en koyu ton bile büyük puan yazısı için 3:1
 * kontrastın üstündedir; bu tonlar üstüne siyah yazı da okunur.
 */
const RATING_COLORS: Record<number, string> = {
  1: "#c0161e",
  2: "#d1261f",
  3: "#e03a2c",
  4: "#ee5a3c",
  5: "#b57838",
  6: "#d4982a",
  7: "#e8c52b",
  8: "#a9cf3c",
  9: "#5fc552",
  10: "#22b45f",
};

/** Puanın rengi; puan yoksa ya da aralık dışındaysa null. */
export function ratingColor(rating: number | null): string | null {
  if (rating === null || !Number.isInteger(rating)) return null;
  return RATING_COLORS[rating] ?? null;
}
