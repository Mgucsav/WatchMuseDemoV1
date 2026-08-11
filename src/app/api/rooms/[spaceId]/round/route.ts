import { errorResponse } from "@/lib/api/responses";
import { normalizeRoomError } from "@/lib/rooms/errors";
import {
  getRoomRoundState,
  initializeRoomRound,
} from "@/lib/rooms/round-service";
import { RoomServiceError } from "@/lib/rooms/service";
import { isRecord, isRoomUuid } from "@/lib/rooms/validation";
import { discoverRoomCandidates } from "@/lib/tmdb/search";

type RouteContext = { params: Promise<{ spaceId: string }> };

/** GET /api/rooms/<spaceId>/round — gizli seçim turunun güvenli özeti. */
export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { spaceId } = await context.params;
  if (!isRoomUuid(spaceId)) return errorResponse("invalid_invitation", "Davet geçersiz.", 400);

  try {
    return Response.json(await getRoomRoundState(spaceId));
  } catch (error) {
    return roomErrorResponse(error);
  }
}

/**
 * POST ilk turu başlatır; `{ reset: true }` yalnızca ortak aday çıkmadığında
 * yeni onlu aday seti üretir. Aday seti RPC içinde atomik olarak kilitlenir.
 */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { spaceId } = await context.params;
  if (!isRoomUuid(spaceId)) return errorResponse("invalid_invitation", "Davet geçersiz.", 400);

  let reset = false;
  try {
    const body: unknown = await request.json();
    reset = isRecord(body) && body.reset === true;
  } catch {
    // Gövdesiz istek ilk tur için geçerlidir.
  }

  try {
    // Mevcut tur varsa gereksiz TMDb isteği atma. İlk anda iki istek gelse bile
    // RPC oda kilidi altında yalnızca birinin aday setini saklar.
    if (!reset) {
      const existing = await getRoomRoundState(spaceId);
      if (existing.round) return Response.json(existing, { status: 200 });
    }

    const candidates = await discoverRoomCandidates();
    await initializeRoomRound(spaceId, candidates, reset);
    return Response.json(await getRoomRoundState(spaceId), { status: 201 });
  } catch (error) {
    return roomErrorResponse(error);
  }
}

function roomErrorResponse(error: unknown): Response {
  const normalized =
    error instanceof RoomServiceError ? error.roomError : normalizeRoomError(error);
  const status =
    normalized.code === "unauthenticated"
      ? 401
      : normalized.code === "not_configured" || normalized.code === "round_requires_supabase"
        ? 503
        : normalized.code === "invalid_invitation"
          ? 404
          : normalized.code.startsWith("round_")
            ? 409
            : 400;
  return errorResponse(normalized.code, normalized.message, status);
}
