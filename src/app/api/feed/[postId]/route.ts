import { errorResponse } from "@/lib/api/responses";
import { normalizeSocialError, socialError } from "@/lib/social/errors";
import { deleteSocialPost, SocialServiceError } from "@/lib/social/service";
import { normalizeOptionalUuid } from "@/lib/social/validation";

type RouteContext = { params: Promise<{ postId: string }> };

/** Yalnızca çağıranın kendi gönderisini veya cevabını siler. */
export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { postId } = await context.params;
  if (normalizeOptionalUuid(postId) === undefined) {
    const error = socialError("social_post_not_found");
    return errorResponse(error.code, error.message, 404);
  }

  try {
    await deleteSocialPost(postId);
    return Response.json({ ok: true });
  } catch (error) {
    const normalized =
      error instanceof SocialServiceError
        ? error.socialError
        : normalizeSocialError(error);
    const status =
      normalized.code === "unauthenticated"
        ? 401
        : normalized.code === "registration_required"
          ? 403
          : normalized.code === "social_post_not_found"
            ? 404
            : normalized.code === "not_configured"
              ? 503
              : 400;
    return errorResponse(normalized.code, normalized.message, status);
  }
}
