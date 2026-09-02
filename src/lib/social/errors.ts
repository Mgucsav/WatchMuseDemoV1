export type SocialErrorCode =
  | "unauthenticated"
  | "registration_required"
  | "invalid_social_post"
  | "invalid_social_movie"
  | "invalid_parent_post"
  | "social_post_not_found"
  | "social_post_rate_limited"
  | "not_configured"
  | "network"
  | "unexpected";

const MESSAGES: Record<SocialErrorCode, string> = {
  unauthenticated: "Oturum bulunamadı. Sayfayı yenileyip tekrar deneyin.",
  registration_required: "Bu işlem için hesabınızı kaydetmeniz veya giriş yapmanız gerekiyor.",
  invalid_social_post: "Gönderi 1-1000 karakter arasında olmalıdır.",
  invalid_social_movie: "Gönderiye eklenen film bilgisi geçersiz.",
  invalid_parent_post: "Yanıtlanacak gönderi bulunamadı.",
  social_post_not_found: "Gönderi bulunamadı.",
  social_post_rate_limited: "Çok hızlı gönderi paylaşıyorsunuz. Lütfen kısa bir süre bekleyin.",
  not_configured: "Sosyal akış henüz yapılandırılmamış.",
  network: "Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.",
  unexpected: "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.",
};

export interface SocialError {
  code: SocialErrorCode;
  message: string;
}

export function socialError(code: SocialErrorCode): SocialError {
  return { code, message: MESSAGES[code] };
}

export function normalizeSocialError(error: unknown): SocialError {
  const code = extractString(error, "code");
  if (code && code in MESSAGES) return socialError(code as SocialErrorCode);
  const message = typeof error === "string" ? error : extractString(error, "message");
  const normalized = message?.trim() ?? "";
  if (normalized in MESSAGES) return socialError(normalized as SocialErrorCode);
  if (error instanceof Error && (error.name === "TypeError" || error.name === "AbortError")) {
    return socialError("network");
  }
  return socialError("unexpected");
}

function extractString(error: unknown, key: string): string | null {
  if (typeof error !== "object" || error === null || !(key in error)) return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}
