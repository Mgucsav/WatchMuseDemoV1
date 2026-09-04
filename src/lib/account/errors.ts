export type AccountErrorCode =
  | "unauthenticated"
  | "registration_required"
  | "invalid_username"
  | "invalid_display_name"
  | "invalid_bio"
  | "invalid_dm_privacy"
  | "username_taken"
  | "invalid_avatar"
  | "avatar_too_large"
  | "invalid_user_search"
  | "invalid_friend_target"
  | "friendship_exists"
  | "friendship_not_found"
  | "invalid_direct_message"
  | "direct_message_forbidden"
  | "direct_message_rate_limited"
  | "user_not_found"
  | "not_configured"
  | "unexpected";

const messages: Record<AccountErrorCode, string> = {
  unauthenticated: "Oturum bulunamadı. Sayfayı yenileyip tekrar deneyin.",
  registration_required: "Bu özellik için hesabınızı kaydetmeniz gerekiyor.",
  invalid_username: "Kullanıcı adı 3-24 karakter olmalı; yalnız küçük harf, rakam ve alt çizgi kullanılabilir.",
  invalid_display_name: "Görünen ad 1-60 karakter olmalı.",
  invalid_bio: "Açıklama en fazla 300 karakter olabilir.",
  invalid_dm_privacy: "Mesaj gizliliği tercihi geçersiz.",
  username_taken: "Bu kullanıcı adı daha önce alınmış.",
  invalid_avatar: "Yalnızca JPG, PNG veya WebP profil fotoğrafı yükleyebilirsiniz.",
  avatar_too_large: "Profil fotoğrafı en fazla 5 MB olabilir.",
  invalid_user_search: "Kullanıcı aramak için en az 2 karakter yazın.",
  invalid_friend_target: "Bu kullanıcıya arkadaşlık isteği gönderilemez.",
  friendship_exists: "Bu kullanıcıyla zaten bir arkadaşlık bağlantınız var.",
  friendship_not_found: "Arkadaşlık isteği veya bağlantı bulunamadı.",
  invalid_direct_message: "Mesaj boş olamaz ve en fazla 2000 karakter olabilir.",
  direct_message_forbidden: "Bu kullanıcı yabancılardan mesaj kabul etmiyor.",
  direct_message_rate_limited: "Çok hızlı mesaj gönderiyorsunuz. Bir saniye bekleyin.",
  user_not_found: "Kullanıcı bulunamadı.",
  not_configured: "Hesap servisi yapılandırılmamış.",
  unexpected: "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.",
};

export class AccountServiceError extends Error {
  constructor(readonly code: AccountErrorCode) {
    super(messages[code]);
    this.name = "AccountServiceError";
  }
}

export function accountError(code: AccountErrorCode): AccountServiceError {
  return new AccountServiceError(code);
}

export function normalizeAccountError(error: unknown): AccountServiceError {
  if (error instanceof AccountServiceError) return error;
  if (
    typeof error === "object" && error !== null && "code" in error &&
    (error as { code: unknown }).code === "23505"
  ) return accountError("username_taken");
  const raw =
    typeof error === "object" && error !== null && "message" in error &&
    typeof (error as { message: unknown }).message === "string"
      ? (error as { message: string }).message.trim()
      : "";
  if (raw in messages) return accountError(raw as AccountErrorCode);
  if (
    typeof error === "object" && error !== null && "code" in error &&
    (error as { code: unknown }).code === "not_configured"
  ) return accountError("not_configured");
  return accountError("unexpected");
}
