import { randomUUID } from "node:crypto";

import { accountError } from "@/lib/account/errors";
import { accountErrorResponse } from "@/lib/account/http";
import { AVATAR_BUCKET, setMyAvatarPath } from "@/lib/account/service";
import { getCurrentUser } from "@/lib/auth/dal";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const MAX_BYTES = 5 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
};

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) throw accountError("registration_required");
    const form = await request.formData();
    const file = form.get("avatar");
    if (!(file instanceof File) || !(file.type in EXTENSIONS)) throw accountError("invalid_avatar");
    if (file.size < 1 || file.size > MAX_BYTES) throw accountError("avatar_too_large");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesSignature(file.type, bytes)) throw accountError("invalid_avatar");

    const admin = createSupabaseAdminClient();
    const { data: old } = await admin.from("profiles").select("avatar_path").eq("id", user.id).maybeSingle();
    const path = `${user.id}/${randomUUID()}.${EXTENSIONS[file.type]}`;
    const { error: uploadError } = await admin.storage.from(AVATAR_BUCKET).upload(path, bytes, {
      contentType: file.type, cacheControl: "31536000", upsert: false,
    });
    if (uploadError) throw uploadError;
    try {
      await setMyAvatarPath(path);
    } catch (error) {
      await admin.storage.from(AVATAR_BUCKET).remove([path]);
      throw error;
    }
    if (typeof old?.avatar_path === "string" && old.avatar_path.startsWith(`${user.id}/`)) {
      await admin.storage.from(AVATAR_BUCKET).remove([old.avatar_path]);
    }
    const { data } = admin.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    return Response.json({ avatarUrl: data.publicUrl });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

export async function DELETE(): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) throw accountError("registration_required");
    const admin = createSupabaseAdminClient();
    const { data: profile } = await admin.from("profiles").select("avatar_path").eq("id", user.id).maybeSingle();
    await setMyAvatarPath(null);
    if (typeof profile?.avatar_path === "string" && profile.avatar_path.startsWith(`${user.id}/`)) {
      await admin.storage.from(AVATAR_BUCKET).remove([profile.avatar_path]);
    }
    return Response.json({ ok: true });
  } catch (error) {
    return accountErrorResponse(error);
  }
}

function matchesSignature(type: string, bytes: Uint8Array): boolean {
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}
