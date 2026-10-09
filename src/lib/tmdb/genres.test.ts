import { describe, expect, it } from "vitest";

import {
  discoverGenreQuery,
  genreLabels,
  isRoomGenre,
  matchesGenreFilter,
} from "./genres";
import { normalizeMovie } from "./search";

describe("film türü etiketleri", () => {
  it("TMDb kimliklerini sırayı koruyarak Türkçe etiketlere çevirir", () => {
    expect(genreLabels([27, 53], "en")).toEqual(["Korku", "Gerilim"]);
    expect(genreLabels([28, 878, 12], "en")).toEqual(["Aksiyon", "Bilim kurgu", "Macera"]);
  });

  it("Japonca animasyonu Anime olarak etiketler", () => {
    expect(genreLabels([16, 14], "ja")).toEqual(["Anime", "Fantastik"]);
    expect(genreLabels([16, 10751], "en")).toEqual(["Animasyon", "Aile"]);
  });

  it("Romantik ve Komedi birlikteyse tek Romantik komedi etiketi verir", () => {
    expect(genreLabels([35, 10749, 18], "en")).toEqual(["Romantik komedi", "Dram"]);
    expect(genreLabels([10749], "en")).toEqual(["Romantik"]);
    expect(genreLabels([35], "en")).toEqual(["Komedi"]);
  });

  it("bilinmeyen kimlikleri atlar, tekrarları tekilleştirir", () => {
    expect(genreLabels([99999, 27, 27], null)).toEqual(["Korku"]);
    expect(genreLabels([], "en")).toEqual([]);
  });

  it("arama sonucundaki genre_ids ve original_language alanlarını okur", () => {
    const movie = normalizeMovie({
      id: 1,
      title: "Ruhların Kaçışı",
      original_title: "千と千尋の神隠し",
      original_language: "ja",
      genre_ids: [16, 10751, 14, "x"],
    });
    expect(movie?.genres).toEqual(["Anime", "Aile", "Fantastik"]);
    expect(normalizeMovie({ id: 2, title: "Türsüz" })?.genres).toEqual([]);
  });
});

describe("oda tür filtresi", () => {
  it("seçilen türleri TMDb kimliklerine VEYA olarak çevirir", () => {
    expect(discoverGenreQuery(["Korku", "Komedi"])).toEqual({
      genreIds: [27, 35],
      originalLanguage: null,
    });
    expect(discoverGenreQuery(["Romantik komedi"]).genreIds).toEqual([10749, 35]);
    expect(discoverGenreQuery(["Anime"])).toEqual({ genreIds: [16], originalLanguage: "ja" });
    expect(discoverGenreQuery([])).toEqual({ genreIds: [], originalLanguage: null });
  });

  it("türetilmiş etiketleri doğru eşler", () => {
    expect(matchesGenreFilter(["Romantik komedi"], ["Romantik"])).toBe(true);
    expect(matchesGenreFilter(["Romantik komedi"], ["Komedi"])).toBe(true);
    expect(matchesGenreFilter(["Anime"], ["Animasyon"])).toBe(true);
    expect(matchesGenreFilter(["Animasyon"], ["Anime"])).toBe(false);
    expect(matchesGenreFilter(["Komedi"], ["Romantik komedi"])).toBe(false);
    expect(matchesGenreFilter(["Dram"], [])).toBe(true);
  });

  it("yalnız listedeki türleri kabul eder", () => {
    expect(isRoomGenre("Korku")).toBe(true);
    expect(isRoomGenre("TV filmi")).toBe(false);
    expect(isRoomGenre("korku")).toBe(false);
  });
});
