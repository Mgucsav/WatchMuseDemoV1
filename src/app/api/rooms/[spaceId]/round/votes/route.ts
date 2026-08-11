import { errorResponse } from "@/lib/api/responses";
import { normalizeRoomError } from "@/lib/rooms/errors";
import { voteInRoomRound } from "@/lib/rooms/round-service";
import { RoomServiceError } from "@/lib/rooms/service";
import { isRecord, isRoomUuid, isRoomVoteChoice } from "@/lib/rooms/validation";

type RouteContext = { params: Promise<{ spaceId: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { spaceId } = await context.params;
  if (!isRoomUuid(spaceId)) return errorResponse("invalid_invitation", "Davet geçersiz.", 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_round_candidate", "Geçerli bir film seçimi gönderin.", 400);
  }

  if (
    !isRecord(body) ||
    typeof body.candidateId !== "string" ||
    !isRoomUuid(body.candidateId) ||
    !isRoomVoteChoice(body.choice)
  ) {
    return errorResponse("invalid_round_candidate", "Geçerli bir film seçimi gönderin.", 400);
  }

  try {
    await voteInRoomRound(spaceId, body.candidateId, body.choice);
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
