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

/** Oda turunda seçilebilen türler (TV filmi hariç), seçim ekranındaki sırayla. */
export const ROOM_GENRE_OPTIONS = [
  "Aksiyon",
  "Macera",
  "Komedi",
  "Romantik komedi",
  "Romantik",
  "Dram",
  "Korku",
  "Gerilim",
  "Bilim kurgu",
  "Fantastik",
  "Animasyon",
  "Anime",
  "Suç",
  "Gizem",
  "Aile",
  "Belgesel",
  "Tarih",
  "Savaş",
  "Müzik",
  "Western",
] as const;

export type RoomGenre = (typeof ROOM_GENRE_OPTIONS)[number];

/** Bir turda en fazla bu kadar tür seçilebilir (veritabanı kısıtıyla aynı). */
export const MAX_ROOM_GENRES = 5;

export function isRoomGenre(value: unknown): value is RoomGenre {
  return typeof value === "string" && (ROOM_GENRE_OPTIONS as readonly string[]).includes(value);
}

const GENRE_IDS_BY_LABEL: Record<RoomGenre, number[]> = {
  Aksiyon: [28],
  Macera: [12],
  Komedi: [COMEDY],
  "Romantik komedi": [ROMANCE, COMEDY],
  Romantik: [ROMANCE],
  Dram: [18],
  Korku: [27],
  Gerilim: [53],
  "Bilim kurgu": [878],
  Fantastik: [14],
  Animasyon: [ANIMATION],
  Anime: [ANIMATION],
  Suç: [80],
  Gizem: [9648],
  Aile: [10751],
  Belgesel: [99],
  Tarih: [36],
  Savaş: [10752],
  Müzik: [10402],
  Western: [37],
};

/**
 * Seçilen türler için TMDb keşif filtresi: kimlikler VEYA ile istenir
 * (`with_genres=a|b`). Yalnız Anime seçildiyse havuz Japonca filmlerle
 * daraltılır. Türetilmiş etiketler sonradan `matchesGenreFilter` ile süzülür.
 */
export function discoverGenreQuery(selected: readonly RoomGenre[]): {
  genreIds: number[];
  originalLanguage: string | null;
} {
  const ids = new Set<number>();
  for (const genre of selected) for (const id of GENRE_IDS_BY_LABEL[genre]) ids.add(id);
  return {
    genreIds: [...ids],
    originalLanguage: selected.length === 1 && selected[0] === "Anime" ? "ja" : null,
  };
}

/**
 * Filmin etiketleri seçilen türlerden en az birine uyuyor mu? Seçim boşsa
 * her film uyar. "Romantik" ve "Komedi" romantik komedileri, "Animasyon"
 * animeleri de kapsar.
 */
export function matchesGenreFilter(
  movieGenres: readonly string[],
  selected: readonly RoomGenre[],
): boolean {
  if (selected.length === 0) return true;
  return selected.some((genre) => {
    if (movieGenres.includes(genre)) return true;
    if ((genre === "Romantik" || genre === "Komedi") && movieGenres.includes("Romantik komedi")) {
      return true;
    }
    return genre === "Animasyon" && movieGenres.includes("Anime");
  });
}

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
