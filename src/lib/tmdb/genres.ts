/**
 * TMDb film türlerinin Türkçe etiketleri.
 *
 * TMDb kimlikleri sabittir; liste https://api.themoviedb.org/3/genre/movie/list
 * ile aynıdır. "Anime" ve "Romantik komedi" TMDb'de ayrı tür değildir; bilinen
 * kombinasyonlardan türetilir.
 */
const TMDB_GENRES: Record<number, string> = {
  28: "Aksiyon",
  12: "Macera",
  16: "Animasyon",
  35: "Komedi",
  80: "Suç",
  99: "Belgesel",
  18: "Dram",
  10751: "Aile",
  14: "Fantastik",
  36: "Tarih",
  27: "Korku",
  10402: "Müzik",
  9648: "Gizem",
  10749: "Romantik",
  878: "Bilim kurgu",
  10770: "TV filmi",
  53: "Gerilim",
  10752: "Savaş",
  37: "Western",
};

const ANIMATION = 16;
const COMEDY = 35;
const ROMANCE = 10749;

/**
 * TMDb tür kimliklerini, geldiği sırayı koruyarak Türkçe etiketlere çevirir.
 *
 * - Japonca (`ja`) animasyon → "Anime"
 * - Romantik + Komedi → tek etiket "Romantik komedi"
 *
 * Bilinmeyen kimlikler atlanır, tekrarlar tekilleştirilir.
 */
export function genreLabels(
  ids: readonly number[],
  originalLanguage: string | null,
): string[] {
  const present = new Set(ids);
  const isAnime = present.has(ANIMATION) && originalLanguage === "ja";
  const isRomCom = present.has(ROMANCE) && present.has(COMEDY);

  const labels: string[] = [];
  for (const id of ids) {
    const label =
      id === ANIMATION && isAnime
        ? "Anime"
        : (id === ROMANCE || id === COMEDY) && isRomCom
          ? "Romantik komedi"
          : TMDB_GENRES[id];
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels;
}
