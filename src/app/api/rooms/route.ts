import type { NextRequest } from "next/server";

import { errorResponse } from "@/lib/api/responses";
import { getLocalRoomUserIdFromServerCookie } from "@/lib/supabase/server";
import { RoomServiceError, createRoom } from "@/lib/rooms/service";
import { normalizeRoomError } from "@/lib/rooms/errors";

/**
 * POST /api/rooms — yeni oda oluşturur.
 *
 * Davet token'ı burada değil, `createRoom` içinde (sunucu-only) üretilir.
 * Yanıt yalnızca oda kimliği ve davet bağlantısını içerir; token hash'i
 * hiçbir koşulda dışarı verilmez.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    // Taban adres istekten türetilir; ters vekil arkasında NEXT_PUBLIC_SITE_URL
    // ile geçersiz kılınabilir.
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || request.nextUrl.origin;
    const localUserId = await getLocalRoomUserIdFromServerCookie();

    const result = await createRoom(baseUrl, localUserId ?? undefined);
    return Response.json(result, { status: 201 });
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
  return 400;
}
