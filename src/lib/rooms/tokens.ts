import "server-only";

import { createHash, randomBytes } from "node:crypto";

/**
 * Davet token'ı üretimi ve hash'lenmesi.
 *
 * GÜVEN SINIRI: düz metin token yalnızca burada — Next.js sunucu belleğinde —
 * ve kullanıcının davet bağlantısında bulunur. Veritabanına **hiçbir zaman**
 * gönderilmez; oraya yalnızca SHA-256 özeti gider.
 *
 * Token asla loglanmaz ve hata mesajlarına konmaz.
 */

/** 256 bit entropi. Gereksinim en az 256 bit. */
export const INVITATION_TOKEN_BYTES = 32;

/** base64url ile 32 bayt → dolgusuz 43 karakter. */
export const INVITATION_TOKEN_LENGTH = 43;

/** SHA-256, hex olarak 64 karakter. */
export const INVITATION_TOKEN_HASH_LENGTH = 64;

/** Yalnızca URL güvenli alfabe: A-Z a-z 0-9 - _ */
export const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const INVITATION_TOKEN_HASH_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Kriptografik olarak güvenli davet token'ı üretir.
 *
 * `randomBytes` kullanılır; `Math.random` tahmin edilebilir olduğu için
 * hiçbir koşulda kullanılmamalıdır.
 */
export function generateInvitationToken(): string {
  return randomBytes(INVITATION_TOKEN_BYTES).toString("base64url");
}

/** Token'ın SHA-256 özetini küçük harf hex olarak döndürür. */
export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Token'ın beklenen biçimde olup olmadığını kontrol eder (kullanmadan önce). */
export function isValidInvitationTokenFormat(token: unknown): token is string {
  return typeof token === "string" && INVITATION_TOKEN_PATTERN.test(token);
}

/**
 * Davet bağlantısını üretir.
 *
 * Saf fonksiyondur; taban adresteki sondaki eğik çizgi ve alt yol farkları
 * normalize edilir. Token yol segmentine kodlanarak yerleştirilir.
 */
export function buildInvitationUrl(baseUrl: string, token: string): string {
  if (!isValidInvitationTokenFormat(token)) {
    // Mesaj token içermez.
    throw new Error("Geçersiz davet token biçimi.");
  }

  const base = new URL(baseUrl);
  // Sondaki eğik çizgiyi tekilleştir, ardından sabit yolu ekle.
  const path = `${base.pathname.replace(/\/+$/, "")}/invite/${encodeURIComponent(token)}`;

  const url = new URL(path, base.origin);
  return url.toString();
}
