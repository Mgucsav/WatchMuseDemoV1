import { errorResponse } from "@/lib/api/responses";
import { normalizeRoomError } from "@/lib/rooms/errors";
import { closeRoom, RoomServiceError } from "@/lib/rooms/service";
import { isRoomUuid } from "@/lib/rooms/validation";
import { getLocalRoomUserIdFromServerCookie } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
  context: { params: Promise<{ spaceId: string }> },
): Promise<Response> {
  const { spaceId } = await context.params;
  if (!isRoomUuid(spaceId)) {
    return errorResponse("invalid_invitation", "Oda bulunamadı.", 404);
  }
  try {
    const localUserId = await getLocalRoomUserIdFromServerCookie();
    await closeRoom(spaceId, localUserId ?? undefined);
    return Response.json({ ok: true });
  } catch (error) {
    const normalized =
      error instanceof RoomServiceError
        ? error.roomError
        : normalizeRoomError(error);
    const status =
      normalized.code === "unauthenticated"
        ? 401
        : normalized.code === "host_required"
          ? 403
          : normalized.code === "invalid_invitation"
            ? 404
            : normalized.code === "not_configured"
              ? 503
              : 400;
    return errorResponse(normalized.code, normalized.message, status);
  }
}
