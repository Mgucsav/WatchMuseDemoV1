import "server-only";

import { errorResponse } from "@/lib/api/responses";
import { normalizeSocialError, socialError } from "./errors";
import { SocialServiceError, toggleSocialReaction } from "./service";
import { normalizeOptionalUuid } from "./validation";

export function socialReactionRoute(reaction: "like" | "repost") {
  return async function POST(
    _request: Request,
    context: { params: Promise<{ postId: string }> },
  ): Promise<Response> {
    const { postId } = await context.params;
    if (normalizeOptionalUuid(postId) === undefined) {
      const error = socialError("social_post_not_found");
      return errorResponse(error.code, error.message, 404);
    }
    try {
      return Response.json({ active: await toggleSocialReaction(postId, reaction) });
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
  };
}
