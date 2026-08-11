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

  // Basit demo modu: geliştirirken gerçek token kullanmak istemiyorsanız
  // `.env.local` içine `TMDB_ACCESS_TOKEN=DEMO` koyabilirsiniz. Bu durumda
  // gerçek TMDb'ye çağrı yapılmaz; sahte (mock) yanıtlar döndürülür.
  if (!token) {
    throw new TmdbError(
      "configuration",
      "TMDb bağlantısı henüz yapılandırılmamış. Sunucuda TMDB_ACCESS_TOKEN değerini ayarlayın.",
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

  // Demo modu: token = "DEMO" ise sahte veri döndür.
  if (token === "DEMO") {
    // Basit, deterministic sahte yanıtlar: arama ve provider uç noktalarını taklit eder.
    if (path === "/search/movie") {
      const q = String(searchParams.query ?? "").trim() || "demo";
      const results = Array.from({ length: 3 }).map((_, i) => ({
        id: 1000 + i,
        title: `${q} Demo Film ${i + 1}`,
        original_title: `${q} Demo Film ${i + 1}`,
        poster_path: "/demo-poster.png",
        overview: `Bu, '${q}' araması için üretilmiş demo açıklamadır.`,
        vote_average: 7.5 - i,
        release_date: "2020-01-01",
      }));

      return {
        page: 1,
        total_results: results.length,
        results,
      };
    }

    const providersMatch = path.match(/^\/movie\/(\d+)\/watch\/providers$/);
    if (providersMatch) {
      const movieId = Number(providersMatch[1]);
      return {
        id: movieId,
        results: {
          TR: {
            flatrate: [
              { provider_id: 8, provider_name: "DemoNet" },
              { provider_id: 9, provider_name: "StreamPlus" },
            ],
            link: `https://www.justwatch.com/tr/film/${movieId}`,
          },
        },
      };
    }

    // Diğer uç noktalar için boş, ama geçerli yapı.
    return {};
  }

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
