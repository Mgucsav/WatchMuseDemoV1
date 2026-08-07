import { isTmdbError } from "@/lib/tmdb/errors";
import type { ApiErrorBody } from "@/lib/tmdb/types";

/**
 * API uçlarının ortak hata yanıtı.
 *
 * Beklenmeyen hataların mesajı dışarı verilmez; yalnızca genel bir metin
 * döndürülür, böylece yığın izi veya iç detay sızmaz.
 */

export function errorResponse(
  code: string,
  message: string,
  status: number,
): Response {
  const body: ApiErrorBody = { error: { code, message } };
  return Response.json(body, { status });
}

export function toErrorResponse(error: unknown): Response {
  if (isTmdbError(error)) {
    return errorResponse(error.code, error.message, error.httpStatus);
  }

  return errorResponse(
    "unexpected",
    "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.",
    500,
  );
}
