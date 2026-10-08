import type { NextRequest } from "next/server";

import { socialCodeResponse, socialErrorResponse } from "@/lib/social/http";
import { listProfilePosts } from "@/lib/social/service";
import {
  normalizeProfilePostKind,
  normalizeProfileUsername,
} from "@/lib/social/validation";

type RouteContext = { params: Promise<{ username: string }> };

/** `?kind=posts|likes`. Beğeniler yalnız profilin sahibine döner. */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const username = normalizeProfileUsername((await context.params).username);
  if (username === undefined) return socialCodeResponse("profile_not_found");
  const kind = normalizeProfilePostKind(request.nextUrl.searchParams.get("kind"));
  if (!kind) return socialCodeResponse("invalid_feed_option");
  try {
    return Response.json({ posts: await listProfilePosts(username, kind) });
  } catch (error) {
    return socialErrorResponse(error);
  }
}
