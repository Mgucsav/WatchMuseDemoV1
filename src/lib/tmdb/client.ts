import "server-only";

import { TMDB_API_BASE_URL, TMDB_REQUEST_TIMEOUT_MS } from "./constants";
import { TmdbError } from "./errors";

/**
 * TMDb HTTP istemcisi.
 *
 * `server-only` importu sayesinde bu modülün bir istemci bileşeninden
 * import edilmesi derleme hatasına yol açar; token hiçbir koşulda tarayıcıya
 * gönderilemez. Token yalnızca burada okunur, loglanmaz ve hata mesajlarına
 * hiçbir parçası yazılmaz.
 */

function readAccessToken(): string {
  const token = process.env.TMDB_ACCESS_TOKEN?.trim();

  if (!token) {
    throw new TmdbError(
      "configuration",
      "TMDb bağlantısı henüz yapılandırılmamış. Sunucuda TMDB_ACCESS_TOKEN tanımlı değil.",
    );
  }

  return token;
}

/**
 * TMDb'den JSON alır. Dönen değer `unknown` olarak ele alınmalı ve
 * çağıran taraf normalize ederek doğrulamalıdır.
 */
export async function tmdbRequest(
  path: string,
  searchParams: Record<string, string> = {},
): Promise<unknown> {
  const token = readAccessToken();

  const url = new URL(`${TMDB_API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        accept: "application/json",
      },
      signal: AbortSignal.timeout(TMDB_REQUEST_TIMEOUT_MS),
      // Önbellekleme sorumluluğu bilinçli olarak `ttl-cache.ts` katmanında.
      cache: "no-store",
    });
  } catch (error) {
    // `AbortSignal.timeout` ve bazı runtime'larda zaman aşımı için
    // farklı hata isimleri atılabiliyor (ör. "TimeoutError" veya
    // "AbortError"). Her iki durumda da kullanıcıya zaman aşımı
    // mesajı gösteriyoruz.
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new TmdbError(
        "timeout",
        "TMDb belirlenen sürede yanıt vermedi. Lütfen tekrar deneyin.",
      );
    }

    throw new TmdbError(
      "network",
      "TMDb servisine ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.",
    );
  }

  if (!response.ok) {
    throw errorForStatus(response.status);
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new TmdbError(
      "invalid_response",
      "TMDb'den okunamayan bir yanıt alındı. Lütfen tekrar deneyin.",
    );
  }
}

function errorForStatus(status: number): TmdbError {
  if (status === 401 || status === 403) {
    // Token'ın geçersiz olduğunu söylüyoruz; değerinden hiçbir parça sızdırmıyoruz.
    return new TmdbError(
      "configuration",
      "TMDb erişim bilgisi reddedildi. Sunucudaki TMDB_ACCESS_TOKEN değerini kontrol edin.",
    );
  }

  if (status === 404) {
    return new TmdbError("not_found", "İstenen kayıt TMDb üzerinde bulunamadı.");
  }

  if (status === 429) {
    return new TmdbError(
      "rate_limited",
      "TMDb istek sınırına ulaşıldı. Kısa bir süre sonra tekrar deneyin.",
    );
  }

  return new TmdbError(
    "upstream",
    `TMDb servisi şu anda yanıt veremiyor (HTTP ${status}). Lütfen tekrar deneyin.`,
  );
}
