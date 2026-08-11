import { describe, expect, it } from "vitest";

import {
  asArray,
  asFiniteNumber,
  asNonEmptyString,
  asPositiveInteger,
  isRecord,
  toPosterUrl,
  toReleaseYear,
  toWatchOptionsUrl,
} from "./normalize";

describe("isRecord", () => {
  it("düz nesneleri kabul eder", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it("dizi, null ve ilkel değerleri reddeder", () => {
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord("x")).toBe(false);
    expect(isRecord(1)).toBe(false);
  });
});

describe("asNonEmptyString", () => {
  it("kırpılmış metni döner", () => {
    expect(asNonEmptyString("  merhaba  ")).toBe("merhaba");
  });

  it("boş, boşluklu ve metin olmayan değerler için null döner", () => {
    expect(asNonEmptyString("")).toBeNull();
    expect(asNonEmptyString("   ")).toBeNull();
    expect(asNonEmptyString(null)).toBeNull();
    expect(asNonEmptyString(undefined)).toBeNull();
    expect(asNonEmptyString(42)).toBeNull();
    expect(asNonEmptyString({})).toBeNull();
  });
});

describe("asFiniteNumber", () => {
  it("sonlu sayıları kabul eder", () => {
    expect(asFiniteNumber(0)).toBe(0);
    expect(asFiniteNumber(-3.5)).toBe(-3.5);
  });

  it("NaN, Infinity ve sayı olmayanları reddeder", () => {
    expect(asFiniteNumber(Number.NaN)).toBeNull();
    expect(asFiniteNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(asFiniteNumber("5")).toBeNull();
    expect(asFiniteNumber(null)).toBeNull();
  });
});

describe("asPositiveInteger", () => {
  it("pozitif tam sayıları kabul eder", () => {
    expect(asPositiveInteger(1)).toBe(1);
    expect(asPositiveInteger(550)).toBe(550);
  });

  it("sıfır, negatif, ondalık ve sayı olmayanları reddeder", () => {
    expect(asPositiveInteger(0)).toBeNull();
    expect(asPositiveInteger(-1)).toBeNull();
    expect(asPositiveInteger(1.5)).toBeNull();
    expect(asPositiveInteger("1")).toBeNull();
    expect(asPositiveInteger(Number.NaN)).toBeNull();
  });
});

describe("asArray", () => {
  it("diziyi olduğu gibi döner, diğer her şey için boş dizi verir", () => {
    expect(asArray([1, 2])).toEqual([1, 2]);
    expect(asArray(null)).toEqual([]);
    expect(asArray(undefined)).toEqual([]);
    expect(asArray("abc")).toEqual([]);
    expect(asArray({ length: 2 })).toEqual([]);
  });
});

describe("toReleaseYear", () => {
  it("TMDb tarih biçiminden yılı çıkarır", () => {
    expect(toReleaseYear("1999-03-31")).toBe(1999);
    expect(toReleaseYear("2024-01-01")).toBe(2024);
  });

  it("bozuk ve aralık dışı değerleri reddeder", () => {
    expect(toReleaseYear("")).toBeNull();
    expect(toReleaseYear(null)).toBeNull();
    expect(toReleaseYear("abcd-01-01")).toBeNull();
    expect(toReleaseYear("1700-01-01")).toBeNull();
    expect(toReleaseYear("3000-01-01")).toBeNull();
    expect(toReleaseYear(1999)).toBeNull();
  });
});

describe("toPosterUrl", () => {
  it("TMDb yolundan tam URL üretir", () => {
    expect(toPosterUrl("/abc.jpg")).toBe(
      "https://image.tmdb.org/t/p/w342/abc.jpg",
    );
  });

  it("null ve eğik çizgiyle başlamayan yolları reddeder", () => {
    expect(toPosterUrl(null)).toBeNull();
    expect(toPosterUrl("abc.jpg")).toBeNull();
    expect(toPosterUrl("")).toBeNull();
  });
});

describe("toWatchOptionsUrl", () => {
  it("güvenilen TMDb https adreslerini kabul eder", () => {
    expect(
      toWatchOptionsUrl("https://www.themoviedb.org/movie/550/watch?locale=TR"),
    ).toBe("https://www.themoviedb.org/movie/550/watch?locale=TR");

    expect(toWatchOptionsUrl("https://themoviedb.org/movie/550/watch")).toBe(
      "https://themoviedb.org/movie/550/watch",
    );
  });

  it("güvenli olmayan protokolleri reddeder", () => {
    expect(toWatchOptionsUrl("javascript:alert(1)")).toBeNull();
    expect(toWatchOptionsUrl("data:text/html,<script></script>")).toBeNull();
    expect(toWatchOptionsUrl("http://www.themoviedb.org/movie/550")).toBeNull();
    expect(toWatchOptionsUrl("ftp://www.themoviedb.org/x")).toBeNull();
  });

  it("güvenilmeyen alan adlarını reddeder", () => {
    expect(toWatchOptionsUrl("https://www.justwatch.com/tr/film/550")).toBeNull();
    expect(toWatchOptionsUrl("https://evil.example.com/x")).toBeNull();
    // Alan adı sonuna eklenmiş sahte alt alan denemesi.
    expect(
      toWatchOptionsUrl("https://www.themoviedb.org.evil.com/movie/550"),
    ).toBeNull();
  });

  it("bozuk ve metin olmayan girdileri reddeder", () => {
    expect(toWatchOptionsUrl("")).toBeNull();
    expect(toWatchOptionsUrl("   ")).toBeNull();
    expect(toWatchOptionsUrl("bir url degil")).toBeNull();
    expect(toWatchOptionsUrl(null)).toBeNull();
    expect(toWatchOptionsUrl(undefined)).toBeNull();
    expect(toWatchOptionsUrl(123)).toBeNull();
    expect(toWatchOptionsUrl({})).toBeNull();
  });
});
