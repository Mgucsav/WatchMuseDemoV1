import { errorResponse, toErrorResponse } from "@/lib/api/responses";
import { getMovieDetails } from "@/lib/tmdb/details";
import { getMovieWatchProviders } from "@/lib/tmdb/providers";
import type { MovieDetailsResult } from "@/lib/tmdb/types";
import { parseMovieId } from "@/lib/validation";

/**
 * GET /api/movies/<tmdbId>
 *
 * Detay görünümünün (MovieDetailModal) tek veri kaynağı: film künyesi,
 * yönetmen ve Türkiye abonelik durumu tek yanıtta döner. Böylece modal
 * açılırken iki ayrı ağ turu beklenmez.
 *
 * Yanıt gösterime özel ve normalize edilmiştir; ham TMDb gövdesi, istek
 * başlıkları veya iç hata ayrıntıları istemciye hiçbir koşulda geçmez
 * (bkz. `toErrorResponse`).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;

  // Yalnızca tam olarak pozitif, güvenli bir tam sayı kabul edilir; değer
  // TMDb URL'ine yerleştirilmeden önce doğrulanır.
  const movieId = parseMovieId(id);

  if (movieId === null) {
    return errorResponse("invalid_movie_id", "Geçersiz film numarası.", 400);
  }

  try {
    // İki çağrı da aynı TMDb istemcisini ve kendi TTL önbelleğini kullanır;
    // paralel çalıştıkları için modal tek bir bekleme süresi görür.
    const [movie, providers] = await Promise.all([
      getMovieDetails(movieId),
      getMovieWatchProviders(movieId),
    ]);

    const body: MovieDetailsResult = { movie, providers };

    return Response.json(body);
  } catch (error) {
    return toErrorResponse(error);
  }
}
