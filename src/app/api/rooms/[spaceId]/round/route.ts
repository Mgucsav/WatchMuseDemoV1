import { errorResponse } from "@/lib/api/responses";
import { normalizeRoomError, roomError } from "@/lib/rooms/errors";
import {
  getRoomRoundState,
  startNextRoomRound,
} from "@/lib/rooms/round-service";
import { sourceAndPersistRoundCandidates } from "@/lib/rooms/candidate-pipeline";
import { RoomServiceError, getRoomState } from "@/lib/rooms/service";
import { loadRoomTasteRanker } from "@/lib/rooms/taste-data";
import { isRoomUuid } from "@/lib/rooms/validation";
import { isRoomGenre, MAX_ROOM_GENRES, type RoomGenre } from "@/lib/tmdb/genres";

type RouteContext = { params: Promise<{ spaceId: string }> };

/** Zevk sıralamasında toplanan sayfa sayısı (sayfa başına ~20 film). */
const TASTE_POOL_PAGES = 4;

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
 * POST ilk ya da bir sonraki turu başlatır. Aktif tur varsa RPC onu döndürür;
 * terminal geçmiş hiçbir zaman silinmez.
 *
 * Aday havuzu YALNIZCA iki katılımcının ortak aboneliklerinden toplanır. Ortak
 * küme istemciden alınmaz: burada, oda durumundan (RLS altında) türetilir.
 */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { spaceId } = await context.params;
  if (!isRoomUuid(spaceId)) return errorResponse("invalid_invitation", "Davet geçersiz.", 400);

  // Gövdesiz istek de geçerlidir (tür kısıtı olmadan). `genres` verilirse
  // yalnız bilinen tür etiketleri, en fazla MAX_ROOM_GENRES tane kabul edilir.
  let genreFilter: RoomGenre[] = [];
  try {
    const body: unknown = await request.json();
    const raw = body && typeof body === "object" ? (body as Record<string, unknown>).genres : undefined;
    if (raw !== undefined) {
      if (!Array.isArray(raw) || raw.length > MAX_ROOM_GENRES || !raw.every(isRoomGenre)) {
        return errorResponse("invalid_genres", "Geçersiz tür seçimi.", 400);
      }
      genreFilter = [...new Set(raw)];
    }
  } catch {
    // Gövdesiz istek ilk tur için geçerlidir.
  }

  try {
    // Mevcut tur varsa gereksiz TMDb isteği atma. İlk anda iki istek gelse bile
    // RPC oda kilidi altında yalnızca birinin aday setini saklar.
    const existing = await getRoomRoundState(spaceId);
    if (
      existing.round &&
      existing.round.status !== "result" &&
      existing.round.status !== "no_match"
    ) {
      return Response.json(existing, { status: 200 });
    }

    // Ortak abonelik yoksa TMDb'ye hiç gidilmez: filtresiz bir öneri üretmek,
    // kullanıcının izleyemeyeceği filmleri önermek olurdu.
    const room = await getRoomState(spaceId);
    if (room.selectionMode !== "wheel") {
      throw new RoomServiceError(roomError("selection_mode_mismatch"));
    }
    if (room.sharedSubscriptions.length === 0) {
      throw new RoomServiceError(roomError("no_shared_subscriptions"));
    }

    // Katılımcıların zevk profili varsa geniş bir havuz toplanıp gruba göre
    // sıralanır; yoksa seed'li rastgele sıralama kullanılır.
    const tasteRanker = await loadRoomTasteRanker(spaceId);
    await sourceAndPersistRoundCandidates(
      (plan) => startNextRoomRound(spaceId, plan),
      {
        providerKeys: room.sharedSubscriptions,
        genreFilter,
        ...(tasteRanker ? { ranker: tasteRanker, minPages: TASTE_POOL_PAGES } : {}),
      },
    );
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
          : normalized.code === "no_shared_subscriptions" ||
              normalized.code === "selection_mode_mismatch" ||
              normalized.code.startsWith("round_")
            ? 409
            : 400;
  return errorResponse(normalized.code, normalized.message, status);
}
