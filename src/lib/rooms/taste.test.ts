import { describe, expect, it } from "vitest";

import type { MovieSummary } from "@/lib/tmdb/types";

import {
  buildGenreAffinity,
  groupScore,
  memberScore,
  rankByTaste,
  SIGNAL_WEIGHTS,
} from "./taste";

function movie(id: number, genres: string[], voteAverage = 7): MovieSummary {
  return {
    id,
    title: `Film ${id}`,
    originalTitle: null,
    releaseYear: 2020,
    posterPath: null,
    posterUrl: null,
    overview: null,
    voteAverage,
    genres,
  };
}

const genres = new Map<number, string[]>([
  [1, ["Korku"]],
  [2, ["Korku", "Gerilim"]],
  [3, ["Komedi"]],
  [4, ["Romantik komedi"]],
]);

describe("kişisel zevk modeli", () => {
  it("yüksek puanlı türü olumlu, düşük puanlıyı olumsuz öğrenir", () => {
    const affinity = buildGenreAffinity(
      [
        { tmdbMovieId: 1, weight: SIGNAL_WEIGHTS.rating(10) },
        { tmdbMovieId: 2, weight: SIGNAL_WEIGHTS.rating(9) },
        { tmdbMovieId: 3, weight: SIGNAL_WEIGHTS.rating(2) },
      ],
      genres,
    );
    expect(affinity.get("Korku")).toBeGreaterThan(0.3);
    expect(affinity.get("Komedi")).toBeLessThan(0);
    expect(affinity.has("Romantik komedi")).toBe(false);
  });

  it("tek bir sinyal bir türü uca taşımaz", () => {
    const affinity = buildGenreAffinity([{ tmdbMovieId: 3, weight: 1 }], genres);
    expect(affinity.get("Komedi")).toBeCloseTo(1 / 3);
  });

  it("puan aralığını -1…+1'e eşler", () => {
    expect(SIGNAL_WEIGHTS.rating(1)).toBe(-1);
    expect(SIGNAL_WEIGHTS.rating(10)).toBe(1);
    expect(SIGNAL_WEIGHTS.rating(5.5)).toBe(0);
  });

  it("grubun birinin nefret ettiği filmi geriye atar (en az mutsuzluk)", () => {
    const loveHate = groupScore([0.8, -0.8]);
    const bothOkay = groupScore([0.2, 0.2]);
    expect(bothOkay).toBeGreaterThan(loveHate);
  });

  it("türü bilinmeyen filme nötr puan verir", () => {
    expect(memberScore(new Map([["Korku", 0.9]]), [])).toBe(0);
  });

  it("profil yoksa sıralamayı rastgele sıralayıcıya bırakır", () => {
    expect(rankByTaste([movie(1, ["Korku"])], [new Map()], "seed")).toBeNull();
  });

  it("grubun sevdiği türü öne alır, her filmi bir kez ve aynı seed'le aynı sırada döndürür", () => {
    const source = [
      ...Array.from({ length: 10 }, (_, i) => movie(100 + i, ["Dram"])),
      movie(1, ["Korku"]),
      ...Array.from({ length: 10 }, (_, i) => movie(200 + i, ["Belgesel"])),
    ];
    const lovesHorror = new Map([["Korku", 0.9], ["Dram", -0.2]]);
    const alsoLikesHorror = new Map([["Korku", 0.6]]);

    const ranked = rankByTaste(source, [lovesHorror, alsoLikesHorror], "seed");
    expect(ranked?.[0].id).toBe(1);
    expect(ranked).toHaveLength(source.length);
    expect(new Set(ranked?.map((entry) => entry.id)).size).toBe(source.length);
    expect(rankByTaste(source, [lovesHorror, alsoLikesHorror], "seed")).toEqual(ranked);
  });

  it("listenin başında aynı ana türü en fazla 3 filmle sınırlar", () => {
    const source = [
      ...Array.from({ length: 20 }, (_, i) => movie(i + 1, ["Komedi"])),
      ...Array.from({ length: 10 }, (_, i) => movie(i + 100, ["Dram"])),
      ...Array.from({ length: 10 }, (_, i) => movie(i + 200, ["Belgesel"])),
      ...Array.from({ length: 10 }, (_, i) => movie(i + 300, ["Aile"])),
    ];
    const ranked = rankByTaste(
      source,
      [new Map([["Komedi", 0.9], ["Dram", 0.1], ["Belgesel", 0.05]])],
      "seed",
    )!;
    const topTen = ranked.slice(0, 10);
    expect(topTen.slice(0, 3).every((entry) => entry.genres[0] === "Komedi")).toBe(true);
    expect(topTen.filter((entry) => entry.genres[0] === "Komedi")).toHaveLength(3);
  });

  it("çeşitlilik tükenirse listeyi boş bırakmaz, en iyi filmle devam eder", () => {
    const source = Array.from({ length: 15 }, (_, i) => movie(i + 1, ["Komedi"]));
    const ranked = rankByTaste(source, [new Map([["Komedi", 0.9]])], "seed")!;
    expect(ranked).toHaveLength(15);
  });
});
