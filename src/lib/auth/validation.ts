/**
 * Kayıt/giriş formu doğrulaması.
 *
 * Saf modüldür; doğrudan test edilir. Hata mesajları Türkçe ve kullanıcıya
 * gösterilebilir; hiçbir zaman girilen şifreyi içermez.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72; // bcrypt sınırı
export const DISPLAY_NAME_MAX_LENGTH = 60;

export interface CredentialsInput {
  email: unknown;
  password: unknown;
  displayName?: unknown;
}

export interface ValidatedCredentials {
  email: string;
  password: string;
  displayName: string | null;
}

export type ValidationResult =
  | { ok: true; value: ValidatedCredentials }
  | { ok: false; error: string };

/** Kasıtlı olarak sade: RFC uyumlu değil, bariz hataları yakalar. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "" || trimmed.length > 254) return null;
  return EMAIL_PATTERN.test(trimmed) ? trimmed : null;
}

export function validateCredentials(
  input: CredentialsInput,
  options: { requireDisplayName?: boolean } = {},
): ValidationResult {
  const email = normalizeEmail(input.email);
  if (email === null) {
    return { ok: false, error: "Geçerli bir e-posta adresi girin." };
  }

  if (typeof input.password !== "string") {
    return { ok: false, error: "Şifre girin." };
  }

  // Şifre KIRPILMAZ: baştaki/sondaki boşluk kullanıcının şifresinin parçasıdır.
  if (input.password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      error: `Şifre en az ${PASSWORD_MIN_LENGTH} karakter olmalı.`,
    };
  }

  if (input.password.length > PASSWORD_MAX_LENGTH) {
    return {
      ok: false,
      error: `Şifre en fazla ${PASSWORD_MAX_LENGTH} karakter olabilir.`,
    };
  }

  let displayName: string | null = null;
  if (typeof input.displayName === "string") {
    const trimmed = input.displayName.trim();
    if (trimmed !== "") {
      if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
        return {
          ok: false,
          error: `Görünen ad en fazla ${DISPLAY_NAME_MAX_LENGTH} karakter olabilir.`,
        };
      }
      displayName = trimmed;
    }
  }

  if (options.requireDisplayName && displayName === null) {
    return { ok: false, error: "Görünen ad girin." };
  }

  return { ok: true, value: { email, password: input.password, displayName } };
}
