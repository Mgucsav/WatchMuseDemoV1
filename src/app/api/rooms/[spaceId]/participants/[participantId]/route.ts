import { errorResponse } from "@/lib/api/responses";
import { normalizeRoomError } from "@/lib/rooms/errors";
import { kickRoomParticipant, RoomServiceError } from "@/lib/rooms/service";
import { isRoomUuid } from "@/lib/rooms/validation";
import { getLocalRoomUserIdFromServerCookie } from "@/lib/supabase/server";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ spaceId: string; participantId: string }> },
): Promise<Response> {
  const { spaceId, participantId } = await context.params;
  if (!isRoomUuid(spaceId) || !isRoomUuid(participantId)) {
    return errorResponse("participant_not_found", "Katılımcı bulunamadı.", 404);
  }

  try {
    const localUserId = await getLocalRoomUserIdFromServerCookie();
    await kickRoomParticipant(spaceId, participantId, localUserId ?? undefined);
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
          : normalized.code === "participant_not_found"
            ? 404
            : normalized.code === "room_locked"
              ? 409
              : normalized.code === "not_configured"
                ? 503
                : 400;
    return errorResponse(normalized.code, normalized.message, status);
  }
}
