import { errorResponse } from "@/lib/api/responses";
import { getLocalRoomUserIdFromServerCookie } from "@/lib/supabase/server";
import { normalizeRoomError } from "@/lib/rooms/errors";
import { RoomServiceError, getRoomState } from "@/lib/rooms/service";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/rooms/<spaceId> — bekleme odası durumu.
 *
 * Tarayıcıdan gelen `spaceId` yetkilendirme için YETERLİ DEĞİLDİR: erişim
 * kontrolü Row Level Security tarafından yapılır ve kullanıcı odanın
 * katılımcısı değilse istek "geçersiz" olarak döner.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ spaceId: string }> },
): Promise<Response> {
  const { spaceId } = await context.params;

  if (!UUID_PATTERN.test(spaceId)) {
    return errorResponse("invalid_invitation", "Davet geçersiz.", 400);
  }

  try {
    const localUserId = await getLocalRoomUserIdFromServerCookie();
    return Response.json(
      await getRoomState(spaceId, localUserId ?? undefined),
      { status: 200 },
    );
  } catch (error) {
    const normalized =
      error instanceof RoomServiceError
        ? error.roomError
        : normalizeRoomError(error);

    const status =
      normalized.code === "unauthenticated"
        ? 401
        : normalized.code === "not_configured"
          ? 503
          : normalized.code === "invalid_invitation"
            ? 404
            : 400;

    return errorResponse(normalized.code, normalized.message, status);
  }
}
