import "server-only";

import { randomUUID } from "node:crypto";

import { getCurrentUser } from "@/lib/auth/dal";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AVATAR_BUCKET, BANNER_BUCKET } from "@/lib/supabase/storage-url";
import { accountError, type AccountErrorCode } from "./errors";
import { setMyAvatarPath, setMyBannerPath } from "./service";

/**
 * Profil fotoğrafı ve kapak fotoğrafı yükleme/kaldırma.
 *
 * Dosya türü hem MIME hem dosya imzasıyla doğrulanır, yol kullanıcı kimliğiyle
 * başlar ve veritabanı güncellenemezse yüklenen dosya geri silinir.
 */
export type ProfileImageKind = "avatar" | "banner";

const MAX_BYTES = 5 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
};

const KINDS: Record<ProfileImageKind, {
  bucket: string;
  column: "avatar_path" | "banner_path";
  setPath: (path: string | null) => Promise<void>;
  invalid: AccountErrorCode;
  tooLarge: AccountErrorCode;
}> = {
  avatar: {
    bucket: AVATAR_BUCKET, column: "avatar_path", setPath: setMyAvatarPath,
    invalid: "invalid_avatar", tooLarge: "avatar_too_large",
  },
  banner: {
    bucket: BANNER_BUCKET, column: "banner_path", setPath: setMyBannerPath,
    invalid: "invalid_banner", tooLarge: "banner_too_large",
  },
};

/** Form alanındaki (`avatar` ya da `banner`) dosyayı yükler; yeni public URL'yi döndürür. */
export async function uploadProfileImage(request: Request, kind: ProfileImageKind): Promise<string> {
  const config = KINDS[kind];
  const user = await getCurrentUser();
  if (!user) throw accountError("registration_required");
  const form = await request.formData();
  const file = form.get(kind);
  if (!(file instanceof File) || !(file.type in EXTENSIONS)) throw accountError(config.invalid);
  if (file.size < 1 || file.size > MAX_BYTES) throw accountError(config.tooLarge);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesSignature(file.type, bytes)) throw accountError(config.invalid);

  const admin = createSupabaseAdminClient();
  const { data: old } = await admin.from("profiles").select(config.column).eq("id", user.id).maybeSingle();
  const path = `${user.id}/${randomUUID()}.${EXTENSIONS[file.type]}`;
  const { error: uploadError } = await admin.storage.from(config.bucket).upload(path, bytes, {
    contentType: file.type, cacheControl: "31536000", upsert: false,
  });
  if (uploadError) throw uploadError;
  try {
    await config.setPath(path);
  } catch (error) {
    await admin.storage.from(config.bucket).remove([path]);
    throw error;
  }
  await removeOwnFile(admin, config.bucket, user.id, readPath(old, config.column));
  return admin.storage.from(config.bucket).getPublicUrl(path).data.publicUrl;
}

export async function removeProfileImage(kind: ProfileImageKind): Promise<void> {
  const config = KINDS[kind];
  const user = await getCurrentUser();
  if (!user) throw accountError("registration_required");
  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin.from("profiles").select(config.column).eq("id", user.id).maybeSingle();
  await config.setPath(null);
  await removeOwnFile(admin, config.bucket, user.id, readPath(profile, config.column));
}

function readPath(row: unknown, column: string): unknown {
  return row && typeof row === "object" ? (row as Record<string, unknown>)[column] : null;
}

async function removeOwnFile(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  bucket: string,
  userId: string,
  path: unknown,
): Promise<void> {
  if (typeof path === "string" && path.startsWith(`${userId}/`)) {
    await admin.storage.from(bucket).remove([path]);
  }
}

function matchesSignature(type: string, bytes: Uint8Array): boolean {
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}
