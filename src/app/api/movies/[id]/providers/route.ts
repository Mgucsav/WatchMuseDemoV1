import { errorResponse, toErrorResponse } from "@/lib/api/responses";
import { getMovieWatchProviders } from "@/lib/tmdb/providers";
import { parseMovieId } from "@/lib/validation";

/**
 * GET /api/movies/<tmdbId>/providers
 *
 * Seçilen filmin Türkiye abonelik durumunu döner. Yalnızca kullanıcı bir film
 * seçtiğinde çağrılır; arama listesindeki her film için istek gönderilmez.
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
    return Response.json(await getMovieWatchProviders(movieId));
  } catch (error) {
    return toErrorResponse(error);
  }
}
