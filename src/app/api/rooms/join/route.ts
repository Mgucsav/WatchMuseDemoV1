import { errorResponse } from "@/lib/api/responses";
import { getLocalRoomUserIdFromServerCookie } from "@/lib/supabase/server";
import { normalizeRoomError, roomError } from "@/lib/rooms/errors";
import { RoomServiceError, joinRoom } from "@/lib/rooms/service";
import { normalizeSubscriptionSelection } from "@/lib/rooms/subscriptions";
import { isRecord } from "@/lib/rooms/validation";

/**
 * POST /api/rooms/join — davet token'ını tüketir.
 *
 * Token, URL'de değil istek gövdesinde taşınır: böylece sunucu erişim
 * kayıtlarına ve `Referer` başlığına düşmez. Gövde ayrıca misafirin abonelik
 * seçimini taşır; ortak küme bu iki seçimin kesişiminden doğar.
 *
 * Yanıt yalnızca oda kimliğini ve rolü içerir; hata mesajları sabit
 * sözlükten gelir ve token'ı asla yankılamaz.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_invitation", "Davet geçersiz.", 400);
  }

  const token = isRecord(body) ? body.token : undefined;
  const subscriptions = normalizeSubscriptionSelection(
    isRecord(body) ? body.subscriptions : undefined,
  );

  if (subscriptions === null) {
    const { code, message } = roomError("invalid_subscriptions");
    return errorResponse(code, message, 400);
  }

  try {
    const localUserId = await getLocalRoomUserIdFromServerCookie();
    const result = await joinRoom(token, subscriptions, localUserId ?? undefined);
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
