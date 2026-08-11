import { errorResponse } from "@/lib/api/responses";
import { getLocalRoomUserIdFromServerCookie } from "@/lib/supabase/server";
import { normalizeRoomError } from "@/lib/rooms/errors";
import { RoomServiceError, joinRoom } from "@/lib/rooms/service";

/**
 * POST /api/rooms/join — davet token'ını tüketir.
 *
 * Token, URL'de değil istek gövdesinde taşınır: böylece sunucu erişim
 * kayıtlarına ve `Referer` başlığına düşmez.
 *
 * Yanıt yalnızca oda kimliğini ve rolü içerir; hata mesajları sabit
 * sözlükten gelir ve token'ı asla yankılamaz.
 */
export async function POST(request: Request): Promise<Response> {
  let token: unknown;

  try {
    const body: unknown = await request.json();
    token =
      typeof body === "object" && body !== null && "token" in body
        ? (body as { token: unknown }).token
        : undefined;
  } catch {
    return errorResponse("invalid_invitation", "Davet geçersiz.", 400);
  }

  try {
    const localUserId = await getLocalRoomUserIdFromServerCookie();
    const result = await joinRoom(token, localUserId ?? undefined);
    return Response.json(result, { status: 200 });
  } catch (error) {
    const normalized =
      error instanceof RoomServiceError
        ? error.roomError
        : normalizeRoomError(error);

    return errorResponse(normalized.code, normalized.message, statusFor(normalized.code));
  }
}

function statusFor(code: string): number {
  if (code === "unauthenticated") return 401;
  if (code === "not_configured") return 503;
  if (code === "room_full") return 409;
  if (code === "invitation_already_used") return 409;
  return 400;
}
