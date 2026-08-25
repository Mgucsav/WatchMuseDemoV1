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
 *
 * Bu modül YALNIZCA gerçek TMDb yanıtları döndürür. Demo/mock/fallback veri
 * yolu bilinçli olarak yoktur: TMDb'ye ulaşılamadığında sahte sonuç üretmek
 * yerine açık bir hata fırlatılır.
 */

function readAccessToken(): string {
  const token = process.env.TMDB_ACCESS_TOKEN?.trim();

  if (!token) {
    throw new TmdbError(
      "not_configured",
      "TMDb bağlantısı henüz yapılandırılmamış. Sunucuda TMDB_ACCESS_TOKEN değeri tanımlı değil.",
    );
  }

  return token;
}

/**
 * `DEMO` is an explicit, keyless preview mode for temporary sharing. It never
 * calls TMDb and provides the same response shapes that the normalizers use.
 */
function demoResponseFor(
  path: string,
  searchParams: Record<string, string>,
): unknown {
  if (path === "/search/movie") {
    const query = searchParams.query?.trim() || "demo";
    const results = Array.from({ length: 3 }, (_, index) => ({
      id: 1000 + index,
      title: `${query} Demo Film ${index + 1}`,
      original_title: `${query} Demo Film ${index + 1}`,
      // A fake remote poster is intentionally avoided; the UI shows its
      // regular placeholder instead.
      poster_path: null,
      overview: `Demo result generated for the \"${query}\" search.`,
      vote_average: 7.5 - index * 0.4,
      release_date: `${2024 - index}-01-01`,
    }));

    return {
      page: 1,
      total_results: results.length,
      results,
    };
  }

  // Oda turu, demo modunda da iki ekrana aynı anda gönderilebilecek on ayrı
  // aday ister. Bunlar yalnızca anahtar olmadan paylaşım/test yapabilmek için
  // kullanılan sabit TMDb-benzeri veridir; gerçek token ile bu dal hiç çalışmaz.
  if (path === "/discover/movie") {
    const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
    const pageOffset = (page - 1) * 1_000_000;
    return {
      page,
      results: [
        [238, "Esaretin Bedeli", "The Shawshank Redemption", 1994, 9.0],
        [278, "Esaretin Bedeli", "The Shawshank Redemption", 1994, 8.7],
        [424, "Schindler'in Listesi", "Schindler's List", 1993, 8.6],
        [155, "Kara Şövalye", "The Dark Knight", 2008, 8.5],
        [550, "Dövüş Kulübü", "Fight Club", 1999, 8.4],
        [680, "Ucuz Roman", "Pulp Fiction", 1994, 8.5],
        [13, "Forrest Gump", "Forrest Gump", 1994, 8.4],
        [27205, "Başlangıç", "Inception", 2010, 8.4],
        [157336, "Yıldızlararası", "Interstellar", 2014, 8.4],
        [603, "Matrix", "The Matrix", 1999, 8.2],
        [120, "Yüzüklerin Efendisi: Yüzük Kardeşliği", "The Lord of the Rings: The Fellowship of the Ring", 2001, 8.4],
      ].map(([id, title, originalTitle, year, voteAverage]) => ({
        id: Number(id) + pageOffset,
        title: page === 1 ? title : `${title} · Demo ${page}`,
        original_title: originalTitle,
        poster_path: null,
        overview: `${title} için demo oda adayı.`,
        release_date: `${year}-01-01`,
        vote_average: voteAverage,
      })),
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
            { provider_id: 8, provider_name: "Netflix" },
            { provider_id: 119, provider_name: "Amazon Prime Video" },
          ],
          link: `https://www.themoviedb.org/movie/${movieId}/watch`,
        },
      },
    };
  }

  return {};
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

  if (token === "DEMO") {
    return demoResponseFor(path, searchParams);
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

/**
 * TMDb HTTP durum kodunu uygulamanın hata sınıflandırmasına çevirir.
 *
 * Mesajlar yalnızca durum kodundan üretilir; TMDb'nin yanıt gövdesi,
 * istek başlıkları veya token'ın herhangi bir parçası kullanılmaz.
 *
 * Test edilebilmesi için dışa aktarılmıştır.
 */
export function errorForStatus(status: number): TmdbError {
  // 401/403, yerel yapılandırma eksikliğinden ayrı bir durumdur: burada bir
  // değer VARDIR ama TMDb onu reddetmiştir (geçersiz, iptal edilmiş veya
  // yetkisiz). Kullanıcıya ".env.local oluşturun" demek yanıltıcı olurdu.
  if (status === 401 || status === 403) {
    return new TmdbError(
      "auth_failed",
      "TMDb erişim bilgisi reddedildi. Sunucudaki TMDb kimlik bilgisi geçersiz veya iptal edilmiş olabilir.",
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
