import { describe, expect, it } from "vitest";

import { DEFAULT_REDIRECT_PATH, safeRedirectPath } from "./redirects";

describe("safeRedirectPath — kabul edilenler", () => {
  it("kendi sitemize ait göreli yolları kabul eder", () => {
    expect(safeRedirectPath("/kutuphanem")).toBe("/kutuphanem");
    expect(safeRedirectPath("/")).toBe("/");
    expect(safeRedirectPath("/rooms/abc-123")).toBe("/rooms/abc-123");
    expect(safeRedirectPath("/giris?next=%2Fkutuphanem")).toBe(
      "/giris?next=%2Fkutuphanem",
    );
  });

  it("baştaki/sondaki boşluğu kırpar", () => {
    expect(safeRedirectPath("  /kutuphanem  ")).toBe("/kutuphanem");
  });
});

describe("safeRedirectPath — açık yönlendirme koruması", () => {
  it("mutlak adresleri reddeder", () => {
    expect(safeRedirectPath("https://evil.example.com")).toBe(
      DEFAULT_REDIRECT_PATH,
    );
    expect(safeRedirectPath("http://evil.example.com/x")).toBe(
      DEFAULT_REDIRECT_PATH,
    );
  });

  it("protokol-göreli adresleri reddeder", () => {
    // `//evil.com` tarayıcıda `https://evil.com` demektir.
    expect(safeRedirectPath("//evil.example.com")).toBe(DEFAULT_REDIRECT_PATH);
    expect(safeRedirectPath("///evil.example.com")).toBe(DEFAULT_REDIRECT_PATH);
  });

  it("ters eğik çizgi hilelerini reddeder", () => {
    // Bazı tarayıcılar `/\` ifadesini `//` gibi çözümler.
    expect(safeRedirectPath("/\\evil.example.com")).toBe(DEFAULT_REDIRECT_PATH);
  });

  it("şema içeren değerleri reddeder", () => {
    expect(safeRedirectPath("javascript:alert(1)")).toBe(DEFAULT_REDIRECT_PATH);
    expect(safeRedirectPath("data:text/html,<script>")).toBe(
      DEFAULT_REDIRECT_PATH,
    );
    expect(safeRedirectPath("mailto:a@b.c")).toBe(DEFAULT_REDIRECT_PATH);
  });

  it("eğik çizgiyle başlamayan değerleri reddeder", () => {
    expect(safeRedirectPath("kutuphanem")).toBe(DEFAULT_REDIRECT_PATH);
    expect(safeRedirectPath("../../etc")).toBe(DEFAULT_REDIRECT_PATH);
  });

  it("kontrol karakteri veya boşluk içerenleri reddeder", () => {
    expect(safeRedirectPath("/kutuphanem\n/evil")).toBe(DEFAULT_REDIRECT_PATH);
    expect(safeRedirectPath("/ kutuphanem")).toBe(DEFAULT_REDIRECT_PATH);
    expect(safeRedirectPath("/\tkutuphanem")).toBe(DEFAULT_REDIRECT_PATH);
  });

  it("metin olmayan ve boş değerleri reddeder", () => {
    expect(safeRedirectPath(null)).toBe(DEFAULT_REDIRECT_PATH);
    expect(safeRedirectPath(undefined)).toBe(DEFAULT_REDIRECT_PATH);
    expect(safeRedirectPath("")).toBe(DEFAULT_REDIRECT_PATH);
    expect(safeRedirectPath("   ")).toBe(DEFAULT_REDIRECT_PATH);
    expect(safeRedirectPath(42)).toBe(DEFAULT_REDIRECT_PATH);
    expect(safeRedirectPath(["/x"])).toBe(DEFAULT_REDIRECT_PATH);
  });
});
