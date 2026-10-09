/**
 * Kişisel zevk modeli (içerik tabanlı grup önerisi).
 *
 * Saf modüldür: veritabanı veya ağ erişimi yoktur, aynı girdi ve seed için
 * aynı sırayı üretir. Veri `taste-data.ts` tarafından sunucuda toplanır.
 *
 * 1. Her katılımcı için tür yakınlığı (-1…+1): puanladığı, izleneceklere
 *    eklediği ve odalarda oyladığı filmlerin türlerinden. Az sinyalli türler
 *    sıfıra doğru çekilir (PRIOR), tek bir puan bir türü uca taşımaz.
 * 2. Her aday için üyelerin puanları birleştirilir: ortalama ile "en az
 *    mutsuzluk"un (en düşük puan) karışımı. Herkesin onaylaması gerektiği için
 *    birinin sevmeyeceği film geriye düşer.
 * 3. Sıralamanın başında çeşitlilik (aynı ana türden en fazla 3) ve keşif
 *    (ilk 10'un 2 yeri rastgele) korunur; model kendi zevk balonunu kurmaz.
 */
import type { MovieSummary } from "@/lib/tmdb/types";

import { createSeededRandom, seededShuffle } from "./seeded-random";

export const TASTE_RANKER_VERSION = "taste-v1";

/** Bir filme dair tek sinyal; ağırlık -1 (sevmedi) … +1 (çok sevdi). */
export interface TasteSignal {
  tmdbMovieId: number;
  weight: number;
}

export type GenreAffinity = ReadonlyMap<string, number>;

/** Az sinyalli türleri sıfıra çeken sözde sayım. */
const PRIOR = 2;
/** Ortalama ile en düşük üye puanının karışımı. */
const AVERAGE_WEIGHT = 0.6;
const LEAST_MISERY_WEIGHT = 0.4;
/** TMDb puanının küçük katkısı: zevk eşitken iyi film öne geçsin. */
const QUALITY_WEIGHT = 0.1;
/** Aynı zevk puanındaki filmler her turda aynı sırada gelmesin. */
const JITTER = 0.04;
/** Sıralamanın başında çeşitlilik ve keşif uygulanan bölüm. */
const HEAD_SIZE = 12;
const MAX_PER_PRIMARY_GENRE = 3;
/** İlk 10'da rastgele keşfe ayrılan sıralar (0 tabanlı). */
const EXPLORATION_SLOTS = new Set([4, 9]);

/** Kütüphane ve oy durumlarını sinyal ağırlığına çevirir. */
export const SIGNAL_WEIGHTS = {
  /** 1–10 puan: 1 → -1, 5.5 → 0, 10 → +1. */
  rating: (rating: number) => Math.max(-1, Math.min(1, (rating - 5.5) / 4.5)),
  watchedUnrated: 0.2,
  watchlist: 0.35,
  vote: { want: 0.8, maybe: 0.2, skip: -0.6 } as const,
};

export function buildGenreAffinity(
  signals: readonly TasteSignal[],
  genresByMovie: ReadonlyMap<number, readonly string[]>,
): Map<string, number> {
  const sum = new Map<string, number>();
  const count = new Map<string, number>();
  for (const signal of signals) {
    const genres = genresByMovie.get(signal.tmdbMovieId);
    if (!genres || genres.length === 0) continue;
    // Çok türlü bir film tek türlü bir filmden daha fazla ağırlık dağıtmaz.
    const share = signal.weight / Math.sqrt(genres.length);
    for (const genre of genres) {
      sum.set(genre, (sum.get(genre) ?? 0) + share);
      count.set(genre, (count.get(genre) ?? 0) + 1);
    }
  }
  const affinity = new Map<string, number>();
  for (const [genre, total] of sum) {
    affinity.set(genre, total / ((count.get(genre) ?? 0) + PRIOR));
  }
  return affinity;
}

/** Bir üyenin bir filme puanı: filmin türlerindeki yakınlıkların ortalaması. */
export function memberScore(affinity: GenreAffinity, movieGenres: readonly string[]): number {
  if (movieGenres.length === 0) return 0;
  let total = 0;
  for (const genre of movieGenres) total += affinity.get(genre) ?? 0;
  return total / movieGenres.length;
}

export function groupScore(memberScores: readonly number[]): number {
  if (memberScores.length === 0) return 0;
  const average = memberScores.reduce((sum, value) => sum + value, 0) / memberScores.length;
  return AVERAGE_WEIGHT * average + LEAST_MISERY_WEIGHT * Math.min(...memberScores);
}

function qualityScore(voteAverage: number | null): number {
  if (voteAverage === null) return 0;
  return Math.max(-1, Math.min(1, (voteAverage - 6.5) / 3.5));
}

/**
 * Üye profilleriyle havuzu sıralar. Hiçbir üyenin profili yoksa null döner;
 * çağıran o zaman seed'li rastgele sıralamayı kullanır.
 */
export function rankByTaste(
  source: readonly MovieSummary[],
  affinities: readonly GenreAffinity[],
  seed: string,
): MovieSummary[] | null {
  if (affinities.every((affinity) => affinity.size === 0)) return null;

  const random = createSeededRandom(`${seed}:taste`);
  const scored = source
    .map((movie) => ({
      movie,
      score:
        groupScore(affinities.map((affinity) => memberScore(affinity, movie.genres))) +
        QUALITY_WEIGHT * qualityScore(movie.voteAverage) +
        (random() * 2 - 1) * JITTER,
    }))
    .sort((a, b) => b.score - a.score || a.movie.id - b.movie.id);

  const ordered: MovieSummary[] = [];
  const used = new Set<number>();
  const primaryCounts = new Map<string, number>();
  // Keşif adayları: zevk puanı alt yarıdaki filmlerden seed'li rastgele.
  const exploration = seededShuffle(
    scored.slice(Math.floor(scored.length / 2)).map((entry) => entry.movie),
    `${seed}:explore`,
  );

  const take = (movie: MovieSummary) => {
    ordered.push(movie);
    used.add(movie.id);
    const primary = movie.genres[0];
    if (primary) primaryCounts.set(primary, (primaryCounts.get(primary) ?? 0) + 1);
  };

  while (ordered.length < Math.min(HEAD_SIZE, scored.length)) {
    if (EXPLORATION_SLOTS.has(ordered.length)) {
      const pick = exploration.find((movie) => !used.has(movie.id));
      if (pick) {
        take(pick);
        continue;
      }
    }
    const next =
      scored.find(
        ({ movie }) =>
          !used.has(movie.id) &&
          (primaryCounts.get(movie.genres[0] ?? "") ?? 0) < MAX_PER_PRIMARY_GENRE,
      ) ?? scored.find(({ movie }) => !used.has(movie.id));
    if (!next) break;
    take(next.movie);
  }

  for (const { movie } of scored) if (!used.has(movie.id)) take(movie);
  return ordered;
}
