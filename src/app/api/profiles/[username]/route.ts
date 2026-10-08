import { socialCodeResponse, socialErrorResponse } from "@/lib/social/http";
import { getPublicProfile } from "@/lib/social/service";
import { normalizeProfileUsername } from "@/lib/social/validation";

type RouteContext = { params: Promise<{ username: string }> };

/** Profil bilgisi. `me` çağıranın kendi profilidir. */
export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const username = normalizeProfileUsername((await context.params).username);
  if (username === undefined) return socialCodeResponse("profile_not_found");
  try {
    return Response.json({ profile: await getPublicProfile(username) });
  } catch (error) {
    return socialErrorResponse(error);
  }
}
