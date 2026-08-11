import { describe, expect, it } from "vitest";

import {
  DISPLAY_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  normalizeEmail,
  validateCredentials,
} from "./validation";

const VALID_PASSWORD = "dogru-sifre-123";

describe("normalizeEmail", () => {
  it("küçük harfe çevirir ve kırpar", () => {
    expect(normalizeEmail("  Kisi@Ornek.COM ")).toBe("kisi@ornek.com");
  });

  it("bariz hatalı adresleri reddeder", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("kisi")).toBeNull();
    expect(normalizeEmail("kisi@")).toBeNull();
    expect(normalizeEmail("@ornek.com")).toBeNull();
    expect(normalizeEmail("kisi@ornek")).toBeNull();
    expect(normalizeEmail("bosluk var@ornek.com")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });

  it("aşırı uzun adresi reddeder", () => {
    expect(normalizeEmail(`${"a".repeat(250)}@ornek.com`)).toBeNull();
  });
});

describe("validateCredentials", () => {
  it("geçerli bilgileri kabul eder", () => {
    const result = validateCredentials({
      email: " Kisi@Ornek.com ",
      password: VALID_PASSWORD,
      displayName: "  Ali  ",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.email).toBe("kisi@ornek.com");
      expect(result.value.displayName).toBe("Ali");
      expect(result.value.password).toBe(VALID_PASSWORD);
    }
  });

  it("şifreyi KIRPMAZ", () => {
    // Baştaki/sondaki boşluk kullanıcının şifresinin parçasıdır.
    const password = "  bosluklu sifre  ";
    const result = validateCredentials({ email: "a@b.co", password });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.password).toBe(password);
  });

  it("kısa şifreyi reddeder", () => {
    const result = validateCredentials({
      email: "a@b.co",
      password: "a".repeat(PASSWORD_MIN_LENGTH - 1),
    });

    expect(result.ok).toBe(false);
  });

  it("aşırı uzun şifreyi reddeder", () => {
    const result = validateCredentials({
      email: "a@b.co",
      password: "a".repeat(PASSWORD_MAX_LENGTH + 1),
    });

    expect(result.ok).toBe(false);
  });

  it("boş görünen adı null yapar", () => {
    const result = validateCredentials({
      email: "a@b.co",
      password: VALID_PASSWORD,
      displayName: "   ",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.displayName).toBeNull();
  });

  it("uzun görünen adı reddeder", () => {
    const result = validateCredentials({
      email: "a@b.co",
      password: VALID_PASSWORD,
      displayName: "a".repeat(DISPLAY_NAME_MAX_LENGTH + 1),
    });

    expect(result.ok).toBe(false);
  });

  it("hata mesajlarında şifreyi yankılamaz", () => {
    const password = "gizli-sifre-degeri";
    const result = validateCredentials({ email: "gecersiz", password });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toContain(password);
  });
});
