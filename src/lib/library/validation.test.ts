import { describe, expect, it } from "vitest";

import {
  NOTE_MAX_LENGTH,
  RATING_MAX,
  RATING_MIN,
  TITLE_MAX_LENGTH,
  isLibraryStatus,
  parseMovieTitle,
  parseNote,
  parsePosterPath,
  parseRating,
  parseTmdbMovieId,
} from "./validation";

describe("isLibraryStatus", () => {
  it("yalnızca iki geçerli durumu kabul eder", () => {
    expect(isLibraryStatus("watchlist")).toBe(true);
    expect(isLibraryStatus("watched")).toBe(true);
    expect(isLibraryStatus("izlendi")).toBe(false);
    expect(isLibraryStatus("")).toBe(false);
    expect(isLibraryStatus(null)).toBe(false);
    expect(isLibraryStatus(1)).toBe(false);
  });
});

describe("parseTmdbMovieId", () => {
  it("pozitif tam sayıyı metin veya sayı olarak kabul eder", () => {
    expect(parseTmdbMovieId("550")).toBe(550);
    expect(parseTmdbMovieId(550)).toBe(550);
  });

  it("bozuk değerleri reddeder", () => {
    expect(parseTmdbMovieId("123abc")).toBeNull();
    expect(parseTmdbMovieId("0")).toBeNull();
    expect(parseTmdbMovieId("-1")).toBeNull();
    expect(parseTmdbMovieId("1.5")).toBeNull();
    expect(parseTmdbMovieId("0123")).toBeNull();
    expect(parseTmdbMovieId("")).toBeNull();
    expect(parseTmdbMovieId(null)).toBeNull();
    expect(parseTmdbMovieId(1.5)).toBeNull();
    expect(parseTmdbMovieId(0)).toBeNull();
  });

  it("güvenli tam sayı sınırının ötesini reddeder", () => {
    expect(parseTmdbMovieId("9007199254740993")).toBeNull();
  });
});

describe("parseRating", () => {
  it("1–10 arası tam sayıyı kabul eder", () => {
    expect(parseRating(RATING_MIN)).toBe(1);
    expect(parseRating(RATING_MAX)).toBe(10);
    expect(parseRating("7")).toBe(7);
  });

  it("boş değeri 'puan yok' olarak yorumlar", () => {
    expect(parseRating("")).toBeNull();
    expect(parseRating(null)).toBeNull();
    expect(parseRating(undefined)).toBeNull();
  });

  it("aralık dışını ve ondalığı geçersiz sayar", () => {
    expect(parseRating(0)).toBeUndefined();
    expect(parseRating(11)).toBeUndefined();
    expect(parseRating(-3)).toBeUndefined();
    expect(parseRating("7.5")).toBeUndefined();
    expect(parseRating("abc")).toBeUndefined();
  });
});

describe("parseNote", () => {
  it("kırpar ve boşu null yapar", () => {
    expect(parseNote("  not  ")).toBe("not");
    expect(parseNote("   ")).toBeNull();
    expect(parseNote(null)).toBeNull();
  });

  it("sınırdaki notu kabul, aşanı reddeder", () => {
    expect(parseNote("a".repeat(NOTE_MAX_LENGTH))).toHaveLength(NOTE_MAX_LENGTH);
    expect(parseNote("a".repeat(NOTE_MAX_LENGTH + 1))).toBeUndefined();
  });

  it("metin olmayanı geçersiz sayar", () => {
    expect(parseNote(42)).toBeUndefined();
  });
});

describe("parseMovieTitle", () => {
  it("kırpar", () => {
    expect(parseMovieTitle("  Matrix  ")).toBe("Matrix");
  });

  it("boş ve metin olmayanı reddeder", () => {
    expect(parseMovieTitle("")).toBeNull();
    expect(parseMovieTitle("   ")).toBeNull();
    expect(parseMovieTitle(null)).toBeNull();
  });

  it("aşırı uzun başlığı kısaltır (reddetmez)", () => {
    const long = "a".repeat(TITLE_MAX_LENGTH + 50);
    expect(parseMovieTitle(long)).toHaveLength(TITLE_MAX_LENGTH);
  });
});

describe("parsePosterPath", () => {
  it("TMDb biçimindeki yolu kabul eder", () => {
    expect(parsePosterPath("/abc123.jpg")).toBe("/abc123.jpg");
    expect(parsePosterPath("/a-b_c.png")).toBe("/a-b_c.png");
  });

  it("biçime uymayan ve tehlikeli değerleri reddeder", () => {
    // Veritabanı kısıtıyla aynı kural: arayüze rastgele adres yerleşemez.
    expect(parsePosterPath("abc.jpg")).toBeNull();
    expect(parsePosterPath("https://evil.example.com/x.jpg")).toBeNull();
    expect(parsePosterPath("/../../etc/passwd")).toBeNull();
    expect(parsePosterPath("/abc 123.jpg")).toBeNull();
    expect(parsePosterPath("javascript:alert(1)")).toBeNull();
    expect(parsePosterPath("")).toBeNull();
    expect(parsePosterPath(null)).toBeNull();
  });
});
