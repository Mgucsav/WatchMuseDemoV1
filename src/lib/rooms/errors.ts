/**
 * Oda işlemlerinin hata normalizasyonu.
 *
 * Veritabanı/PostgREST hataları hiçbir zaman ham haliyle arayüze geçmez:
 * SQL ayrıntısı, tablo adı, kısıt adı ve — en önemlisi — davet token'ı
 * sızdırılmaz. Tanınmayan her hata genel `unexpected` koduna indirgenir.
 *
 * Saf modüldür; doğrudan test edilir.
 */

export type RoomErrorCode =
  | "unauthenticated"
  | "invalid_invitation"
  | "invitation_expired"
  | "invitation_already_used"
  | "room_full"
  | "host_cannot_join"
  | "room_closed"
  | "subscriptions_required"
  | "invalid_subscriptions"
  | "no_shared_subscriptions"
  | "selection_mode_mismatch"
  | "movie_not_on_shared_provider"
  | "round_not_ready"
  | "round_closed_for_votes"
  | "invalid_round_candidate"
  | "invalid_candidates"
  | "candidate_pool_incomplete"
  | "round_creation_moved"
  | "invalid_selection"
  | "selection_expired"
  | "invalid_teleparty_link"
  | "teleparty_not_ready"
  | "host_required"
  | "guest_required"
  | "registration_required"
  | "public_room_required"
  | "private_password_required"
  | "invalid_room_password"
  | "room_password_required"
  | "participant_not_found"
  | "participant_banned"
  | "room_locked"
  | "invalid_room_message"
  | "room_message_rate_limited"
  | "round_requires_supabase"
  | "not_configured"
  | "network"
  | "unexpected";

export interface RoomError {
  code: RoomErrorCode;
  /** Kullanıcıya gösterilebilir, genel Türkçe mesaj. */
  message: string;
}

const MESSAGES: Record<RoomErrorCode, string> = {
  unauthenticated: "Oturum bulunamadı. Sayfayı yenileyip tekrar deneyin.",
  invalid_invitation: "Davet geçersiz.",
  invitation_expired: "Davetin süresi dolmuş.",
  invitation_already_used: "Bu davet daha önce kullanılmış.",
  room_full: "Oda dolu.",
  host_cannot_join:
    "Bu odayı siz oluşturdunuz; kendi davetinizle misafir olarak katılamazsınız.",
  room_closed: "Oda kapatılmış.",
  subscriptions_required:
    "Devam etmek için en az bir abonelik seçin.",
  invalid_subscriptions:
    "Abonelik seçimi geçersiz. Listedeki platformlardan en az birini seçin.",
  no_shared_subscriptions:
    "Katılımcıların ortak aboneliği yok. Öneriler yalnızca herkeste olan platformlardan gelir.",
  selection_mode_mismatch:
    "Bu işlem odanın film seçme yöntemiyle uyumlu değil.",
  movie_not_on_shared_provider:
    "Bu film katılımcıların ortak abonelik platformlarında bulunmuyor.",
  round_not_ready: "Seçim turu henüz hazır değil.",
  round_closed_for_votes: "Bu turun seçimleri artık değiştirilemez.",
  invalid_round_candidate: "Seçilen film bu odaya ait değil.",
  invalid_candidates: "Film adayları hazırlanamadı. Lütfen tekrar deneyin.",
  round_creation_moved:
    "Bu sürüm artık yeni tur başlatamıyor. Sayfayı yenileyin; sorun sürerse kısa bir bakım yapılıyor olabilir.",
  candidate_pool_incomplete:
    "Yeterli sayıda uygun film bulunamadı. Lütfen biraz sonra tekrar deneyin.",
  invalid_selection: "Seçilen oda filmi bulunamadı.",
  selection_expired: "Bu filmi listeye ekleme süresi dolmuş.",
  invalid_teleparty_link: "Panoda geçerli bir Teleparty davet bağlantısı bulunamadı.",
  teleparty_not_ready: "Teleparty için önce bütün katılımcıların filmi kabul etmesi gerekiyor.",
  host_required: "Bu işlemi yalnızca oda sahibi yapabilir.",
  guest_required: "Oda sahibi odadan ayrılamaz; odayı kapatmalıdır.",
  registration_required:
    "Public odalar için hesabınızı kaydetmeniz veya giriş yapmanız gerekiyor.",
  public_room_required: "Bu oda public katılıma açık değil.",
  private_password_required: "Bu private odaya şifreyle katılmanız gerekiyor.",
  invalid_room_password: "Oda şifresi yanlış.",
  room_password_required: "Private oda için 6-64 karakterlik bir şifre belirleyin.",
  participant_not_found: "Katılımcı bu odada bulunamadı.",
  participant_banned: "Bu odaya yeniden katılmanıza izin verilmiyor.",
  room_locked: "Aktif seçim turu sırasında katılımcı listesi değiştirilemez.",
  invalid_room_message: "Mesaj boş olamaz ve en fazla 1000 karakter olabilir.",
  room_message_rate_limited: "Çok hızlı mesaj gönderiyorsunuz. Lütfen kısa bir süre bekleyin.",
  round_requires_supabase: "Ortak seçim turu için Supabase bağlantısı gereklidir.",
  not_configured: "Oda servisi henüz yapılandırılmamış.",
  network: "Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.",
  unexpected: "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.",
};

/**
 * Veritabanı fonksiyonlarının fırlattığı sabit mesajlar.
 * Bunlar `supabase/migrations/…_rooms_functions.sql` içindeki sözleşmedir.
 */
const DATABASE_ERROR_CODES: readonly RoomErrorCode[] = [
  "unauthenticated",
  "invalid_invitation",
  "invitation_expired",
  "invitation_already_used",
  "room_full",
  "host_cannot_join",
  "room_closed",
  "subscriptions_required",
  "invalid_subscriptions",
  "no_shared_subscriptions",
  "selection_mode_mismatch",
  "movie_not_on_shared_provider",
  "round_not_ready",
  "round_closed_for_votes",
  "invalid_round_candidate",
  "invalid_candidates",
  "candidate_pool_incomplete",
  "round_creation_moved",
  "invalid_selection",
  "selection_expired",
  "invalid_teleparty_link",
  "teleparty_not_ready",
  "host_required",
  "guest_required",
  "registration_required",
  "public_room_required",
  "private_password_required",
  "invalid_room_password",
  "room_password_required",
  "participant_not_found",
  "participant_banned",
  "room_locked",
  "invalid_room_message",
  "room_message_rate_limited",
];

/** Sözlükte karşılığı olan tüm kodlar (veritabanı sözleşmesi + yerel kodlar). */
const ALL_ERROR_CODES: readonly RoomErrorCode[] = [
  ...DATABASE_ERROR_CODES,
  "not_configured",
  "network",
  "round_requires_supabase",
  "unexpected",
];

function isRoomErrorCode(value: string): value is RoomErrorCode {
  return (DATABASE_ERROR_CODES as readonly string[]).includes(value);
}

function isKnownErrorCode(value: string): value is RoomErrorCode {
  return (ALL_ERROR_CODES as readonly string[]).includes(value);
}

/** Bilinen bir koddan `RoomError` üretir. */
export function roomError(code: RoomErrorCode): RoomError {
  return { code, message: MESSAGES[code] };
}

/**
 * Herhangi bir hatayı güvenli bir `RoomError`e indirger.
 *
 * ÖNEMLİ: dönen `message` **daima** sabit sözlükten gelir. Girdi hatasının
 * kendi metni hiçbir koşulda dışarı verilmez; bu, token veya SQL ayrıntısının
 * arayüze sızmasını yapısal olarak imkânsız kılar.
 */
export function normalizeRoomError(error: unknown): RoomError {
  // Zaten `RoomError` biçiminde fırlatılmış bir değer (ör. yerel oda deposu).
  // Mesaj DAİMA sözlükten yeniden üretilir; gelen metne asla güvenilmez.
  const directCode = extractCode(error);
  if (directCode !== null && isKnownErrorCode(directCode)) {
    return roomError(directCode);
  }

  const raw = extractMessage(error);

  if (raw !== null) {
    // Veritabanı sözleşmesindeki sabit belirteçler tam eşleşmeyle aranır.
    const trimmed = raw.trim();
    if (isRoomErrorCode(trimmed)) {
      return roomError(trimmed);
    }

    if (/^invalid_token_hash$/.test(trimmed)) {
      return roomError("invalid_invitation");
    }
  }

  if (hasCode(error, "not_configured")) {
    return roomError("not_configured");
  }

  if (isLikelyNetworkError(error)) {
    return roomError("network");
  }

  return roomError("unexpected");
}

function extractMessage(error: unknown): string | null {
  if (typeof error === "string") return error;

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return null;
}

function extractCode(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }

  return null;
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === code
  );
}

function isLikelyNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "TypeError" || error.name === "AbortError";
}
