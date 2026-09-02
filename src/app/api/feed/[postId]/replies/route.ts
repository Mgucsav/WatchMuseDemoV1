import { errorResponse } from "@/lib/api/responses";
import { normalizeSocialError, socialError } from "@/lib/social/errors";
import { listSocialPosts, SocialServiceError } from "@/lib/social/service";
import { normalizeOptionalUuid } from "@/lib/social/validation";

export async function GET(
  _request: Request,
  context: { params: Promise<{ postId: string }> },
): Promise<Response> {
  const { postId } = await context.params;
  if (normalizeOptionalUuid(postId) === undefined) {
    const error = socialError("social_post_not_found");
    return errorResponse(error.code, error.message, 404);
  }
  try {
    return Response.json({ posts: await listSocialPosts(postId) });
  } catch (error) {
    const normalized =
      error instanceof SocialServiceError
        ? error.socialError
        : normalizeSocialError(error);
    return errorResponse(
      normalized.code,
      normalized.message,
      normalized.code === "unauthenticated"
        ? 401
        : normalized.code === "not_configured"
          ? 503
          : 400,
    );
  }
}
