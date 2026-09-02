import { errorResponse } from "@/lib/api/responses";
import { normalizeRoomError, roomError } from "@/lib/rooms/errors";
import { RoomServiceError, joinPublicRoom } from "@/lib/rooms/service";
import { normalizeSubscriptionSelection } from "@/lib/rooms/subscriptions";
import { isRecord, isRoomUuid } from "@/lib/rooms/validation";
import { getLocalRoomUserIdFromServerCookie } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ spaceId: string }> },
): Promise<Response> {
  const { spaceId } = await context.params;
  if (!isRoomUuid(spaceId)) {
    return errorResponse("public_room_required", "Public oda bulunamadı.", 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidSubscriptions();
  }
  const subscriptions = normalizeSubscriptionSelection(
    isRecord(body) ? body.subscriptions : undefined,
  );
  if (subscriptions === null) return invalidSubscriptions();

  try {
    const localUserId = await getLocalRoomUserIdFromServerCookie();
    return Response.json(
      await joinPublicRoom(spaceId, subscriptions, localUserId ?? undefined),
    );
  } catch (error) {
    const normalized =
      error instanceof RoomServiceError
        ? error.roomError
        : normalizeRoomError(error);
    const status =
      normalized.code === "unauthenticated"
        ? 401
        : normalized.code === "registration_required"
          ? 403
          : normalized.code === "room_full" || normalized.code === "room_locked"
            ? 409
            : normalized.code === "not_configured"
              ? 503
              : 400;
    return errorResponse(normalized.code, normalized.message, status);
  }
}

function invalidSubscriptions(): Response {
  const { code, message } = roomError("invalid_subscriptions");
  return errorResponse(code, message, 400);
}
