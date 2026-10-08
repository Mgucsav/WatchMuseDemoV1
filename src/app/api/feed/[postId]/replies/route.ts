import { socialCodeResponse, socialErrorResponse } from "@/lib/social/http";
import { listSocialReplies } from "@/lib/social/service";
import { normalizeOptionalUuid } from "@/lib/social/validation";

export async function GET(
  _request: Request,
  context: { params: Promise<{ postId: string }> },
): Promise<Response> {
  const { postId } = await context.params;
  if (!normalizeOptionalUuid(postId)) return socialCodeResponse("social_post_not_found");
  try {
    return Response.json({ posts: await listSocialReplies(postId) });
  } catch (error) {
    return socialErrorResponse(error);
  }
}
