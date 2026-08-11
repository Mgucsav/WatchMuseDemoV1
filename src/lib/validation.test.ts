import { describe, expect, it } from "vitest";

import { parseMovieId } from "./validation";

describe("parseMovieId", () => {
  it("geçerli pozitif tam sayı metnini kabul eder", () => {
    expect(parseMovieId("1")).toBe(1);
    expect(parseMovieId("550")).toBe(550);
    expect(parseMovieId("9007199254740991")).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("harf içeren değerleri reddeder", () => {
    // Number.parseInt("123abc") sessizce 123 döndürürdü; bu kabul edilemez.
    expect(parseMovieId("123abc")).toBeNull();
    expect(parseMovieId("abc")).toBeNull();
    expect(parseMovieId("12e3")).toBeNull();
    expect(parseMovieId("0x10")).toBeNull();
  });

  it("ondalık değerleri reddeder", () => {
    expect(parseMovieId("1.5")).toBeNull();
    expect(parseMovieId("1.0")).toBeNull();
    expect(parseMovieId(".5")).toBeNull();
  });

  it("negatif değerleri ve sıfırı reddeder", () => {
    expect(parseMovieId("-1")).toBeNull();
    expect(parseMovieId("-0")).toBeNull();
    expect(parseMovieId("0")).toBeNull();
  });

  it("boş ve yalnızca boşluktan oluşan değerleri reddeder", () => {
    expect(parseMovieId("")).toBeNull();
    expect(parseMovieId(" ")).toBeNull();
    expect(parseMovieId(" 1 ")).toBeNull();
    expect(parseMovieId("1 ")).toBeNull();
  });

  it("güvenli tam sayı sınırının ötesini reddeder", () => {
    // 9007199254740993 kayan noktada 9007199254740992'ye yuvarlanır.
    expect(parseMovieId("9007199254740993")).toBeNull();
    expect(parseMovieId("99999999999999999999")).toBeNull();
  });

  it("kanonik olmayan gösterimleri reddeder", () => {
    expect(parseMovieId("0123")).toBeNull();
    expect(parseMovieId("+1")).toBeNull();
    expect(parseMovieId("01")).toBeNull();
  });

  it("metin olmayan değerleri reddeder", () => {
    expect(parseMovieId(undefined)).toBeNull();
    expect(parseMovieId(null)).toBeNull();
    expect(parseMovieId(550)).toBeNull();
    expect(parseMovieId(["550"])).toBeNull();
    expect(parseMovieId({})).toBeNull();
  });
});
