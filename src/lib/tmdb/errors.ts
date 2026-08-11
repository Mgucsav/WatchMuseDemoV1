/**
 * TMDb erişim katmanının hata modeli.
 *
 * Buradaki mesajlar doğrudan kullanıcıya gösterilir; bu yüzden hiçbir zaman
 * token, istek başlığı veya TMDb'nin ham yanıt gövdesi içermezler.
 */

export type TmdbErrorCode =
  /** Sunucuda TMDb kimlik bilgisi hiç tanımlı değil — yerel yapılandırma eksiği. */
  | "not_configured"
  /** Kimlik bilgisi var ama TMDb reddetti (401/403) — geçersiz veya iptal edilmiş. */
  | "auth_failed"
  | "network"
  | "timeout"
  | "rate_limited"
  | "upstream"
  | "invalid_response"
  | "not_found";

const HTTP_STATUS_BY_CODE: Record<TmdbErrorCode, number> = {
  // Servis yapılandırılmadığı için kullanılamıyor.
  not_configured: 503,
  // Yukarı akış bizim kimlik bilgimizi reddetti; istemcinin hatası değil.
  auth_failed: 502,
  network: 502,
  timeout: 504,
  rate_limited: 429,
  upstream: 502,
  invalid_response: 502,
  not_found: 404,
};

export class TmdbError extends Error {
  readonly code: TmdbErrorCode;

  constructor(code: TmdbErrorCode, message: string) {
    super(message);
    this.name = "TmdbError";
    this.code = code;
  }

  get httpStatus(): number {
    return HTTP_STATUS_BY_CODE[this.code];
  }
}

export function isTmdbError(error: unknown): error is TmdbError {
  return error instanceof TmdbError;
}
