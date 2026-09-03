import { errorResponse, toErrorResponse } from "@/lib/api/responses";
import { normalizeRoomError, roomError } from "@/lib/rooms/errors";
import {
  getRoomRoundState,
  startDirectRoomSelection,
} from "@/lib/rooms/round-service";
import { getRoomState, RoomServiceError } from "@/lib/rooms/service";
import { isRecord, isRoomUuid } from "@/lib/rooms/validation";
import { getMovieDetails } from "@/lib/tmdb/details";
import { isTmdbError } from "@/lib/tmdb/errors";
import { getMovieWatchProviders } from "@/lib/tmdb/providers";
import { parseMovieId } from "@/lib/validation";

type RouteContext = { params: Promise<{ spaceId: string }> };

/** Hostun belirlediği TMDb filmini doğrudan oda oturumu olarak başlatır. */
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
    return invalidMovieResponse();
  }

  const value = isRecord(body) ? body.tmdbMovieId : null;
  const movieId = parseMovieId(
    typeof value === "number" && Number.isSafeInteger(value)
      ? String(value)
      : value,
  );
  if (movieId === null) return invalidMovieResponse();

  try {
    const room = await getRoomState(spaceId);
    if (room.myRole !== "host") {
      throw new RoomServiceError(roomError("host_required"));
    }
    if (room.selectionMode !== "direct") {
      throw new RoomServiceError(roomError("selection_mode_mismatch"));
    }
    if (!room.enoughParticipants) {
      throw new RoomServiceError(roomError("round_not_ready"));
    }

    const [movie, providers] = await Promise.all([
      getMovieDetails(movieId),
      getMovieWatchProviders(movieId),
    ]);
    const providerKeys = providers.providers
      .filter(
        (provider) =>
          provider.available && room.sharedSubscriptions.includes(provider.key),
      )
      .map((provider) => provider.key);

    if (providerKeys.length === 0) {
      throw new RoomServiceError(roomError("movie_not_on_shared_provider"));
    }

    await startDirectRoomSelection(spaceId, movie, providerKeys);
    return Response.json(await getRoomRoundState(spaceId), { status: 201 });
  } catch (error) {
    if (isTmdbError(error)) return toErrorResponse(error);
    const normalized =
      error instanceof RoomServiceError
        ? error.roomError
        : normalizeRoomError(error);
    return errorResponse(
      normalized.code,
      normalized.message,
      statusFor(normalized.code),
    );
  }
}

function invalidMovieResponse(): Response {
  return errorResponse("invalid_movie_id", "Geçersiz film numarası.", 400);
}

function statusFor(code: string): number {
  if (code === "unauthenticated") return 401;
  if (code === "host_required") return 403;
  if (code === "invalid_invitation") return 404;
  if (code === "not_configured" || code === "round_requires_supabase") return 503;
  if (
    code === "round_not_ready" ||
    code === "selection_mode_mismatch" ||
    code === "movie_not_on_shared_provider"
  ) {
    return 409;
  }
  return 400;
}
