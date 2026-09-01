import { errorResponse } from "@/lib/api/responses";
import { normalizeRoomError } from "@/lib/rooms/errors";
import {
  getRoomTelepartyStates,
  shareRoomTelepartyLink,
} from "@/lib/rooms/round-service";
import { RoomServiceError } from "@/lib/rooms/service";
import { parseTelepartyJoinUrl } from "@/lib/rooms/teleparty";
import { isRecord, isRoomUuid } from "@/lib/rooms/validation";

type RouteContext = { params: Promise<{ spaceId: string }> };

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { spaceId } = await context.params;
  if (!isRoomUuid(spaceId)) {
    return errorResponse("invalid_invitation", "Davet geçersiz.", 400);
  }

  try {
    return Response.json({
      telepartyStates: await getRoomTelepartyStates(spaceId),
    });
  } catch (error) {
    return toTelepartyErrorResponse(error);
  }
}

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
    return errorResponse(
      "invalid_teleparty_link",
      "Panoda geçerli bir Teleparty davet bağlantısı bulunamadı.",
      400,
    );
  }

  const selectionId = isRecord(body) ? body.selectionId : null;
  const joinUrl = isRecord(body)
    ? parseTelepartyJoinUrl(body.joinUrl)
    : null;
  if (
    typeof selectionId !== "string" ||
    !isRoomUuid(selectionId) ||
    joinUrl === null
  ) {
    return errorResponse(
      "invalid_teleparty_link",
      "Panoda geçerli bir Teleparty davet bağlantısı bulunamadı.",
      400,
    );
  }

  try {
    await shareRoomTelepartyLink(spaceId, selectionId, joinUrl);
    return Response.json({
      telepartyStates: await getRoomTelepartyStates(spaceId),
    });
  } catch (error) {
    return toTelepartyErrorResponse(error);
  }
}

function toTelepartyErrorResponse(error: unknown): Response {
  const normalized =
    error instanceof RoomServiceError
      ? error.roomError
      : normalizeRoomError(error);
  const status =
    normalized.code === "unauthenticated"
      ? 401
      : normalized.code === "invalid_invitation"
        ? 404
        : normalized.code === "host_required"
          ? 403
          : normalized.code === "selection_expired" ||
              normalized.code === "teleparty_not_ready"
            ? 409
            : 400;
  return errorResponse(normalized.code, normalized.message, status);
}
