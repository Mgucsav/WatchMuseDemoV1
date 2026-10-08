import type { NextRequest } from "next/server";

import { socialCodeResponse, socialErrorResponse } from "@/lib/social/http";
import { createSocialPost, listSocialFeed } from "@/lib/social/service";
import {
  normalizeFeedScope,
  normalizeFeedSort,
  normalizeOptionalUuid,
  normalizeSocialBody,
  normalizeSocialMovie,
} from "@/lib/social/validation";

/** `?scope=all|following&sort=hot|top|new` */
export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  const scope = normalizeFeedScope(params.get("scope"));
  const sort = normalizeFeedSort(params.get("sort"));
  if (!scope || !sort) return socialCodeResponse("invalid_feed_option");
  try {
    return Response.json({ posts: await listSocialFeed(scope, sort) });
  } catch (error) {
    return socialErrorResponse(error);
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
    return socialErrorResponse(error);
  }
}

function invalidPost(): Response {
  return socialCodeResponse("invalid_social_post");
}
