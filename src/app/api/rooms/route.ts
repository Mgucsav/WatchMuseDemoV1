import type { NextRequest } from "next/server";

import { errorResponse } from "@/lib/api/responses";
import { getLocalRoomUserIdFromServerCookie } from "@/lib/supabase/server";
import {
  RoomServiceError,
  createRoom,
  listPublicRooms,
} from "@/lib/rooms/service";
import { normalizeRoomError, roomError } from "@/lib/rooms/errors";
import { normalizeSubscriptionSelection } from "@/lib/rooms/subscriptions";
import {
  isRecord,
  isRoomSelectionMode,
  isRoomVisibility,
  normalizeRoomCapacity,
  normalizeRoomName,
  normalizeRoomPassword,
} from "@/lib/rooms/validation";

export async function GET(): Promise<Response> {
  try {
    return Response.json({ rooms: await listPublicRooms() });
  } catch (error) {
    const normalized =
      error instanceof RoomServiceError
        ? error.roomError
        : normalizeRoomError(error);
    return errorResponse(normalized.code, normalized.message, statusFor(normalized.code));
  }
}

/**
 * POST /api/rooms — yeni oda oluşturur.
 *
 * Gövde: `{ subscriptions: ["netflix", …] }` — oda sahibinin abonelikleri.
 * Seçim burada, güven sınırında doğrulanır: tanınmayan anahtar sessizce
 * atılmaz, istek tümüyle reddedilir (bkz. `normalizeSubscriptionSelection`).
 *
 * Davet token'ı burada değil, `createRoom` içinde (sunucu-only) üretilir.
 * Yanıt yalnızca oda kimliği ve davet bağlantısını içerir; token hash'i
 * hiçbir koşulda dışarı verilmez.
 */
export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return subscriptionsError();
  }

  const subscriptions = normalizeSubscriptionSelection(
    isRecord(body) ? body.subscriptions : undefined,
  );
  if (subscriptions === null) return subscriptionsError();

  const record = isRecord(body) ? body : {};
  const visibility = record.visibility ?? "private";
  const capacity = normalizeRoomCapacity(record.capacity ?? 2);
  const selectionMode = record.selectionMode ?? "wheel";
  const name = normalizeRoomName(
    record.name ??
      (visibility === "public" ? "Public karar odası" : "Özel karar odası"),
  );
  const password =
    visibility === "private" ? normalizeRoomPassword(record.password) : null;
  if (
    !isRoomVisibility(visibility) ||
    !isRoomSelectionMode(selectionMode) ||
    capacity === null ||
    name === null
  ) {
    const { code, message } = roomError("unexpected");
    return errorResponse(code, message, 400);
  }
  if (visibility === "private" && password === null) {
    const { code, message } = roomError("room_password_required");
    return errorResponse(code, message, 400);
  }

  try {
    // Taban adres istekten türetilir; ters vekil arkasında NEXT_PUBLIC_SITE_URL
    // ile geçersiz kılınabilir.
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || request.nextUrl.origin;
    const localUserId = await getLocalRoomUserIdFromServerCookie();

    const result = await createRoom(
      baseUrl,
      subscriptions,
      { name, visibility, selectionMode, capacity, password },
      localUserId ?? undefined,
    );
    return Response.json(result, { status: 201 });
  } catch (error) {
    const normalized =
      error instanceof RoomServiceError
        ? error.roomError
        : normalizeRoomError(error);

    return errorResponse(normalized.code, normalized.message, statusFor(normalized.code));
  }
}

function subscriptionsError(): Response {
  const { code, message } = roomError("invalid_subscriptions");
  return errorResponse(code, message, 400);
}

function statusFor(code: string): number {
  if (code === "unauthenticated") return 401;
  if (code === "registration_required") return 403;
  if (code === "not_configured") return 503;
  return 400;
}
