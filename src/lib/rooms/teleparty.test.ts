import { describe, expect, it } from "vitest";

import { parseTelepartyJoinUrl, toTelepartyMovieUrl } from "./teleparty";

describe("parseTelepartyJoinUrl", () => {
  it("resmi Teleparty katılım bağlantısını kabul eder", () => {
    expect(
      parseTelepartyJoinUrl(
        "  https://redirect.teleparty.com/join/390d2c023aec4fcf  ",
      ),
    ).toBe("https://redirect.teleparty.com/join/390d2c023aec4fcf");
  });

  it.each([
    "http://redirect.teleparty.com/join/390d2c023aec4fcf",
    "https://redirect.teleparty.com.evil.example/join/390d2c023aec4fcf",
    "https://redirect.teleparty.com/join/short",
    "https://redirect.teleparty.com/join/390d2c023aec4fcf?next=evil",
    "https://redirect.teleparty.com/join/390d2c023aec4fcf#fragment",
    "https://user@redirect.teleparty.com/join/390d2c023aec4fcf",
    "not-a-url",
  ])("resmi katılım bağlantısı olmayan değeri reddeder: %s", (value) => {
    expect(parseTelepartyJoinUrl(value)).toBeNull();
  });
});

describe("toTelepartyMovieUrl", () => {
  it("TMDb kimliği ve özgün başlıktan resmi film sayfasını üretir", () => {
    expect(toTelepartyMovieUrl(68734, "Argo")).toBe(
      "https://www.teleparty.com/movie/68734/argo",
    );
  });

  it("başlığı URL için güvenli hale getirir", () => {
    expect(toTelepartyMovieUrl(42, "Amélie: L'été!")).toBe(
      "https://www.teleparty.com/movie/42/amelie-l-ete",
    );
  });

  it("geçersiz kimlik veya latin slug üretmeyen başlığı reddeder", () => {
    expect(toTelepartyMovieUrl(0, "Argo")).toBeNull();
    expect(toTelepartyMovieUrl(68734, "東京")).toBeNull();
  });
});
