import type { NextRequest } from "next/server";

import { errorResponse } from "@/lib/api/responses";
import {
  normalizeSocialError,
  socialError,
} from "@/lib/social/errors";
import {
  createSocialPost,
  listSocialPosts,
  SocialServiceError,
} from "@/lib/social/service";
import {
  normalizeOptionalUuid,
  normalizeSocialBody,
  normalizeSocialMovie,
} from "@/lib/social/validation";

export async function GET(): Promise<Response> {
  try {
    return Response.json({ posts: await listSocialPosts(null) });
  } catch (error) {
    return socialApiError(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidPost();
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return invalidPost();
  const record = body as Record<string, unknown>;
  const postBody = normalizeSocialBody(record.body);
  const parentPostId = normalizeOptionalUuid(record.parentPostId);
  const movie = normalizeSocialMovie(record.movie);
  if (postBody === null || parentPostId === undefined || movie === undefined) {
    return invalidPost();
  }
  try {
    const postId = await createSocialPost({ body: postBody, parentPostId, movie });
    return Response.json({ postId }, { status: 201 });
  } catch (error) {
    return socialApiError(error);
  }
}

function invalidPost(): Response {
  const error = socialError("invalid_social_post");
  return errorResponse(error.code, error.message, 400);
}

function socialApiError(error: unknown): Response {
  const normalized =
    error instanceof SocialServiceError
      ? error.socialError
      : normalizeSocialError(error);
  const status =
    normalized.code === "unauthenticated"
      ? 401
      : normalized.code === "registration_required"
        ? 403
        : normalized.code === "social_post_not_found" ||
            normalized.code === "invalid_parent_post"
          ? 404
          : normalized.code === "social_post_rate_limited"
            ? 429
            : normalized.code === "not_configured"
              ? 503
              : 400;
  return errorResponse(normalized.code, normalized.message, status);
}
