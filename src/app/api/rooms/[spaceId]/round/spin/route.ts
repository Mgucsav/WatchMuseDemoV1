import { errorResponse } from "@/lib/api/responses";
import { normalizeRoomError } from "@/lib/rooms/errors";
import { startRoomRoundWheel } from "@/lib/rooms/round-service";
import { RoomServiceError } from "@/lib/rooms/service";
import { isRoomUuid } from "@/lib/rooms/validation";

type RouteContext = { params: Promise<{ spaceId: string }> };

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  const { spaceId } = await context.params;
  if (!isRoomUuid(spaceId)) return errorResponse("invalid_invitation", "Davet geçersiz.", 400);

  try {
    await startRoomRoundWheel(spaceId);
    return Response.json({ ok: true });
  } catch (error) {
    const normalized =
      error instanceof RoomServiceError ? error.roomError : normalizeRoomError(error);
    return errorResponse(
      normalized.code,
      normalized.message,
      normalized.code === "unauthenticated" ? 401 : normalized.code.startsWith("round_") ? 409 : 400,
    );
  }
}
