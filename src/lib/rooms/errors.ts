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
];

/** Sözlükte karşılığı olan tüm kodlar (veritabanı sözleşmesi + yerel kodlar). */
const ALL_ERROR_CODES: readonly RoomErrorCode[] = [
  ...DATABASE_ERROR_CODES,
  "not_configured",
  "network",
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
