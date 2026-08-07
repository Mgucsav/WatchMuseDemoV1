import type { NextRequest } from "next/server";

import { errorResponse, toErrorResponse } from "@/lib/api/responses";
import { SEARCH_MIN_QUERY_LENGTH } from "@/lib/constants";
import { searchMovies } from "@/lib/tmdb/search";

/**
 * GET /api/movies/search?q=<arama>
 *
 * Gerçek TMDb sonuçları döner. Sahte veya örnek film verisi kullanılmaz;
 * TMDb'ye ulaşılamadığında hata yanıtı verilir.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (query.length < SEARCH_MIN_QUERY_LENGTH) {
    return errorResponse(
      "invalid_query",
      `Arama için en az ${SEARCH_MIN_QUERY_LENGTH} karakter girin.`,
      400,
    );
  }

  try {
    return Response.json(await searchMovies(query));
  } catch (error) {
    return toErrorResponse(error);
  }
}
