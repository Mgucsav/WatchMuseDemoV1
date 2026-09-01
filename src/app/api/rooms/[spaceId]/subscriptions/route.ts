import { errorResponse } from "@/lib/api/responses";
import { normalizeRoomError, roomError } from "@/lib/rooms/errors";
import { RoomServiceError, updateMySubscriptions } from "@/lib/rooms/service";
import { normalizeSubscriptionSelection } from "@/lib/rooms/subscriptions";
import { isRecord, isRoomUuid } from "@/lib/rooms/validation";
import { getLocalRoomUserIdFromServerCookie } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ spaceId: string }> };

/**
 * PUT /api/rooms/<spaceId>/subscriptions — çağıranın KENDİ abonelik seçimi.
 *
 * Yalnızca çağıranın satırı değişir; partnerin seçimi bu uçtan değiştirilemez.
 * Aktif tur etkilenmez — yeni kesişim bir sonraki turda geçerli olur
 * (bkz. `updateMySubscriptions`).
 */
export async function PUT(
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
    return invalidSubscriptions();
  }

  const subscriptions = normalizeSubscriptionSelection(
    isRecord(body) ? body.subscriptions : undefined,
  );
  if (subscriptions === null) return invalidSubscriptions();

  try {
    const localUserId = await getLocalRoomUserIdFromServerCookie();
    return Response.json(
      await updateMySubscriptions(
        spaceId,
        subscriptions,
        localUserId ?? undefined,
      ),
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

function invalidSubscriptions(): Response {
  const { code, message } = roomError("invalid_subscriptions");
  return errorResponse(code, message, 400);
}
