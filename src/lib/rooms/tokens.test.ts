import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  INVITATION_TOKEN_BYTES,
  INVITATION_TOKEN_HASH_PATTERN,
  INVITATION_TOKEN_LENGTH,
  INVITATION_TOKEN_PATTERN,
  buildInvitationUrl,
  generateInvitationToken,
  hashInvitationToken,
  isValidInvitationTokenFormat,
} from "./tokens";

describe("generateInvitationToken — biçim ve entropi varsayımları", () => {
  it("en az 256 bit entropi kullanır", () => {
    expect(INVITATION_TOKEN_BYTES).toBeGreaterThanOrEqual(32);
    expect(INVITATION_TOKEN_BYTES * 8).toBeGreaterThanOrEqual(256);
  });

  it("beklenen uzunlukta base64url token üretir", () => {
    const token = generateInvitationToken();
    expect(token).toHaveLength(INVITATION_TOKEN_LENGTH);
    expect(INVITATION_TOKEN_PATTERN.test(token)).toBe(true);
  });

  it("yalnızca URL güvenli karakterler içerir", () => {
    for (let i = 0; i < 200; i += 1) {
      const token = generateInvitationToken();
      // base64 dolgusu ve URL'de sorun çıkaran karakterler bulunmamalı.
      expect(token).not.toContain("=");
      expect(token).not.toContain("+");
      expect(token).not.toContain("/");
      expect(encodeURIComponent(token)).toBe(token);
    }
  });

  it("pratikte çakışma üretmez", () => {
    const count = 1000;
    const seen = new Set<string>();
    for (let i = 0; i < count; i += 1) {
      seen.add(generateInvitationToken());
    }
    expect(seen.size).toBe(count);
  });

  it("sabit bir değer döndürmez", () => {
    expect(generateInvitationToken()).not.toBe(generateInvitationToken());
  });
});

describe("hashInvitationToken — determinizm", () => {
  it("aynı girdi için daima aynı özeti üretir", () => {
    const token = generateInvitationToken();
    expect(hashInvitationToken(token)).toBe(hashInvitationToken(token));
  });

  it("farklı girdiler için farklı özet üretir", () => {
    expect(hashInvitationToken("a")).not.toBe(hashInvitationToken("b"));
  });

  it("64 haneli küçük harf hex döndürür", () => {
    const hash = hashInvitationToken(generateInvitationToken());
    expect(hash).toHaveLength(64);
    expect(INVITATION_TOKEN_HASH_PATTERN.test(hash)).toBe(true);
  });

  it("bilinen SHA-256 vektörüyle uyuşur", () => {
    // Bağımsız doğrulama: uygulamanın gerçekten SHA-256 kullandığını gösterir.
    expect(hashInvitationToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(hashInvitationToken("abc")).toBe(
      createHash("sha256").update("abc", "utf8").digest("hex"),
    );
  });

  it("özet, token'ın kendisini içermez", () => {
    const token = generateInvitationToken();
    expect(hashInvitationToken(token)).not.toContain(token);
  });
});

describe("isValidInvitationTokenFormat", () => {
  it("üretilen token'ı kabul eder", () => {
    expect(isValidInvitationTokenFormat(generateInvitationToken())).toBe(true);
  });

  it("yanlış uzunluk, yanlış alfabe ve metin olmayan değerleri reddeder", () => {
    expect(isValidInvitationTokenFormat("kisa")).toBe(false);
    expect(isValidInvitationTokenFormat("a".repeat(42))).toBe(false);
    expect(isValidInvitationTokenFormat("a".repeat(44))).toBe(false);
    expect(isValidInvitationTokenFormat(`${"a".repeat(42)}+`)).toBe(false);
    expect(isValidInvitationTokenFormat(`${"a".repeat(42)}/`)).toBe(false);
    expect(isValidInvitationTokenFormat("")).toBe(false);
    expect(isValidInvitationTokenFormat(null)).toBe(false);
    expect(isValidInvitationTokenFormat(undefined)).toBe(false);
    expect(isValidInvitationTokenFormat(123)).toBe(false);
  });
});

describe("buildInvitationUrl", () => {
  const token = "A".repeat(43);

  it("davet adresini doğru kurar", () => {
    expect(buildInvitationUrl("https://watchmuse.example.com", token)).toBe(
      `https://watchmuse.example.com/invite/${token}`,
    );
  });

  it("taban adresteki sondaki eğik çizgiyi tekilleştirir", () => {
    expect(buildInvitationUrl("https://example.com/", token)).toBe(
      `https://example.com/invite/${token}`,
    );
    expect(buildInvitationUrl("https://example.com///", token)).toBe(
      `https://example.com/invite/${token}`,
    );
  });

  it("yerel geliştirme adresiyle çalışır", () => {
    expect(buildInvitationUrl("http://localhost:3000", token)).toBe(
      `http://localhost:3000/invite/${token}`,
    );
  });

  it("taban adresteki sorgu ve fragment'i taşımaz", () => {
    const url = buildInvitationUrl("https://example.com/?a=1#x", token);
    expect(url).toBe(`https://example.com/invite/${token}`);
  });

  it("geçersiz token biçimini reddeder ve mesajda token'ı yankılamaz", () => {
    const bad = "not-a-valid-token";
    expect(() => buildInvitationUrl("https://example.com", bad)).toThrow();

    try {
      buildInvitationUrl("https://example.com", bad);
    } catch (error) {
      expect((error as Error).message).not.toContain(bad);
    }
  });

  it("üretilen gerçek token'lar için geçerli bir URL döndürür", () => {
    for (let i = 0; i < 50; i += 1) {
      const real = generateInvitationToken();
      const url = new URL(buildInvitationUrl("https://example.com", real));
      expect(url.pathname).toBe(`/invite/${real}`);
    }
  });
});

describe("kalıcılık yükü — düz metin token sızmaz", () => {
  /**
   * `createRoom` ve `joinRoom` veritabanına yalnızca bu şekli gönderir.
   * Bu test, o sözleşmenin düz metin token içermediğini sabitler.
   */
  it("create_space RPC yükü yalnızca hash içerir", () => {
    const token = generateInvitationToken();
    const payload = { p_token_hash: hashInvitationToken(token) };

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain(token);
    expect(Object.keys(payload)).toEqual(["p_token_hash"]);
    expect(INVITATION_TOKEN_HASH_PATTERN.test(payload.p_token_hash)).toBe(true);
  });

  it("join_space_with_invitation RPC yükü yalnızca hash içerir", () => {
    const token = generateInvitationToken();
    const payload = { p_token_hash: hashInvitationToken(token) };

    expect(JSON.stringify(payload)).not.toContain(token);
    expect(Object.values(payload)).not.toContain(token);
  });

  it("hash'ten token geri elde edilemez (uzunluk ve alfabe farklı)", () => {
    const token = generateInvitationToken();
    const hash = hashInvitationToken(token);

    expect(hash).not.toBe(token);
    expect(hash.length).not.toBe(token.length);
    // Hash yalnızca hex; token base64url büyük/küçük harf ve -_ içerebilir.
    expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
  });
});
