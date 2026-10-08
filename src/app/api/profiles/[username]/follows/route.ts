import type { NextRequest } from "next/server";

import { socialCodeResponse, socialErrorResponse } from "@/lib/social/http";
import { listFollows } from "@/lib/social/service";
import {
  normalizeFollowListKind,
  normalizeProfileUsername,
} from "@/lib/social/validation";

type RouteContext = { params: Promise<{ username: string }> };

/** `?kind=followers|following` */
export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const username = normalizeProfileUsername((await context.params).username);
  if (username === undefined) return socialCodeResponse("profile_not_found");
  const kind = normalizeFollowListKind(request.nextUrl.searchParams.get("kind"));
  if (!kind) return socialCodeResponse("invalid_feed_option");
  try {
    return Response.json({ people: await listFollows(username, kind) });
  } catch (error) {
    return socialErrorResponse(error);
  }
}
