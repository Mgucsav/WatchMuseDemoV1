import { accountError } from "@/lib/account/errors";
import { accountErrorResponse } from "@/lib/account/http";
import { getMySocialProfile, updateMySocialProfile } from "@/lib/account/service";
import type { DmPrivacy } from "@/lib/account/types";

export async function GET(): Promise<Response> {
  try {
    return Response.json({ profile: await getMySocialProfile() });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") throw accountError("invalid_username");
    const value = body as Record<string, unknown>;
    const username = typeof value.username === "string" ? value.username.trim().toLowerCase() : "";
    const displayName = typeof value.displayName === "string" ? value.displayName.trim() : "";
    const bio = typeof value.bio === "string" ? value.bio.trim() : "";
    const dmPrivacy = value.dmPrivacy;
    if (!/^[a-z0-9_]{3,24}$/.test(username)) throw accountError("invalid_username");
    if (displayName.length < 1 || displayName.length > 60) throw accountError("invalid_display_name");
    if (bio.length > 300) throw accountError("invalid_bio");
    if (dmPrivacy !== "everyone" && dmPrivacy !== "friends" && dmPrivacy !== "nobody") {
      throw accountError("invalid_dm_privacy");
    }
    const profile = await updateMySocialProfile({ username, displayName, bio, dmPrivacy: dmPrivacy as DmPrivacy });
    return Response.json({ profile });
  } catch (error) {
    return accountErrorResponse(error);
  }
}
