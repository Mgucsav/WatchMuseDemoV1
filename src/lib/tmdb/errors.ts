/**
 * TMDb erişim katmanının hata modeli.
 *
 * Buradaki mesajlar doğrudan kullanıcıya gösterilir; bu yüzden hiçbir zaman
 * token, istek başlığı veya TMDb'nin ham yanıt gövdesi içermezler.
 */

export type TmdbErrorCode =
  | "configuration"
  | "network"
  | "timeout"
  | "rate_limited"
  | "upstream"
  | "invalid_response"
  | "not_found";

const HTTP_STATUS_BY_CODE: Record<TmdbErrorCode, number> = {
  configuration: 503,
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
