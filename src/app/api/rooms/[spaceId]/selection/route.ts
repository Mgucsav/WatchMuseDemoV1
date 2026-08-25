import { errorResponse } from "@/lib/api/responses";
import { normalizeRoomError } from "@/lib/rooms/errors";
import { acceptRoomSelection, getRoomRoundState } from "@/lib/rooms/round-service";
import { RoomServiceError } from "@/lib/rooms/service";
import { isRecord, isRoomUuid } from "@/lib/rooms/validation";

type RouteContext = { params: Promise<{ spaceId: string }> };

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { spaceId } = await context.params;
  if (!isRoomUuid(spaceId)) {
    return errorResponse("invalid_invitation", "Davet geçersiz.", 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_selection", "Seçilen oda filmi bulunamadı.", 400);
  }

  if (
    !isRecord(body) ||
    typeof body.selectionId !== "string" ||
    !isRoomUuid(body.selectionId)
  ) {
    return errorResponse("invalid_selection", "Seçilen oda filmi bulunamadı.", 400);
  }

  try {
    await acceptRoomSelection(spaceId, body.selectionId);
    return Response.json(await getRoomRoundState(spaceId));
  } catch (error) {
    const normalized =
      error instanceof RoomServiceError
        ? error.roomError
        : normalizeRoomError(error);
    const status =
      normalized.code === "unauthenticated"
        ? 401
        : normalized.code === "invalid_invitation"
          ? 404
          : normalized.code === "selection_expired"
            ? 409
            : 400;
    return errorResponse(normalized.code, normalized.message, status);
  }
}
