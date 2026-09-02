import { errorResponse } from "@/lib/api/responses";
import { normalizeRoomError, roomError } from "@/lib/rooms/errors";
import {
  getRoomMessages,
  RoomServiceError,
  sendRoomMessage,
} from "@/lib/rooms/service";
import {
  isRecord,
  isRoomUuid,
  normalizeRoomMessage,
} from "@/lib/rooms/validation";
import { getLocalRoomUserIdFromServerCookie } from "@/lib/supabase/server";

type Context = { params: Promise<{ spaceId: string }> };

export async function GET(
  _request: Request,
  context: Context,
): Promise<Response> {
  const { spaceId } = await context.params;
  if (!isRoomUuid(spaceId)) return invalidRoom();

  try {
    const localUserId = await getLocalRoomUserIdFromServerCookie();
    const messages = await getRoomMessages(spaceId, localUserId ?? undefined);
    return Response.json({ messages });
  } catch (error) {
    return roomApiError(error);
  }
}

export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  const { spaceId } = await context.params;
  if (!isRoomUuid(spaceId)) return invalidRoom();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidMessage();
  }
  const message = normalizeRoomMessage(isRecord(body) ? body.message : undefined);
  if (message === null) return invalidMessage();

  try {
    const localUserId = await getLocalRoomUserIdFromServerCookie();
    await sendRoomMessage(spaceId, message, localUserId ?? undefined);
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return roomApiError(error);
  }
}

function invalidRoom(): Response {
  const { code, message } = roomError("invalid_invitation");
  return errorResponse(code, message, 404);
}

function invalidMessage(): Response {
  const { code, message } = roomError("invalid_room_message");
  return errorResponse(code, message, 400);
}

function roomApiError(error: unknown): Response {
  const normalized =
    error instanceof RoomServiceError
      ? error.roomError
      : normalizeRoomError(error);
  const status =
    normalized.code === "unauthenticated"
      ? 401
      : normalized.code === "invalid_invitation"
        ? 404
        : normalized.code === "room_message_rate_limited"
          ? 429
          : normalized.code === "not_configured"
            ? 503
            : 400;
  return errorResponse(normalized.code, normalized.message, status);
}
