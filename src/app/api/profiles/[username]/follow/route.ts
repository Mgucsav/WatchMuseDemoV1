import { socialCodeResponse, socialErrorResponse } from "@/lib/social/http";
import { toggleFollow } from "@/lib/social/service";
import { normalizeProfileUsername } from "@/lib/social/validation";

type RouteContext = { params: Promise<{ username: string }> };

/** Takip et / takibi bırak; yeni durumu döndürür. */
export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  const username = normalizeProfileUsername((await context.params).username);
  if (!username) return socialCodeResponse("invalid_follow_target");
  try {
    return Response.json({ following: await toggleFollow(username) });
  } catch (error) {
    return socialErrorResponse(error);
  }
}
