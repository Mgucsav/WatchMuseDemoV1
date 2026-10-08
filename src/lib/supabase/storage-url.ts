export const AVATAR_BUCKET = "profile-avatars";
export const BANNER_BUCKET = "profile-banners";

/** Herkese açık Supabase Storage nesnesinin adresi; yol yoksa null. */
export function publicStorageUrl(bucket: string, path: unknown): string | null {
  if (typeof path !== "string" || path === "") return null;
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  return configured ? `${configured}/storage/v1/object/public/${bucket}/${path}` : null;
}
