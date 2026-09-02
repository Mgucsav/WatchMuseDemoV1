import { describe, expect, it } from "vitest";

import {
  normalizeOptionalUuid,
  normalizeSocialBody,
  normalizeSocialMovie,
} from "./validation";

describe("sosyal akış girdi doğrulaması", () => {
  it("gönderi metnini kırpar ve uzunluğu sınırlar", () => {
    expect(normalizeSocialBody("  iyi filmdi  ")).toBe("iyi filmdi");
    expect(normalizeSocialBody("   ")).toBeNull();
    expect(normalizeSocialBody("x".repeat(1001))).toBeNull();
  });

  it("parent UUID alanını güvenli biçimde ayrıştırır", () => {
    expect(normalizeOptionalUuid(null)).toBeNull();
    expect(normalizeOptionalUuid("f4bde699-e65a-48fc-ae7c-1ba94f06d82c")).toBe(
      "f4bde699-e65a-48fc-ae7c-1ba94f06d82c",
    );
    expect(normalizeOptionalUuid("bad")).toBeUndefined();
  });

  it("yalnız güvenli TMDb film snapshot'ını kabul eder", () => {
    expect(
      normalizeSocialMovie({ id: 42, title: "Film", posterPath: "/poster.jpg" }),
    ).toEqual({ id: 42, title: "Film", posterPath: "/poster.jpg" });
    expect(
      normalizeSocialMovie({ id: 42, title: "Film", posterPath: "https://evil.test/x" }),
    ).toBeUndefined();
    expect(normalizeSocialMovie(null)).toBeNull();
  });
});
