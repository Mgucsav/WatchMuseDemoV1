/**
 * Oda özelliğinin uygulama sözleşmeleri.
 *
 * Yalnızca tip içerir; derleme sırasında silinir, bu yüzden istemci
 * bileşenlerinden güvenle import edilebilir.
 *
 * Bu tiplerin hiçbirinde `token_hash` veya düz metin token ALANI YOKTUR —
 * bu, sızıntıyı tip seviyesinde engeller.
 */

export type ParticipantRole = "host" | "guest";
export type SpaceStatus = "active" | "closed";

/** Oda oluşturma sonucu. Düz metin token yalnızca `inviteUrl` içinde döner. */
export interface CreateRoomResult {
  spaceId: string;
  /** Tam davet bağlantısı. Kullanıcıya bir kez gösterilir; saklanmaz. */
  inviteUrl: string;
  /** Davetin son kullanma anı (ISO 8601, sunucuda üretilir). */
  invitationExpiresAt: string;
}

/** Davet tüketme sonucu. */
export interface JoinRoomResult {
  spaceId: string;
  role: ParticipantRole;
  /** Kullanıcı zaten bu odanın üyesiyse `true` (yenileme/geri gelme durumu). */
  alreadyMember: boolean;
}

/** Bekleme odasının gösterdiği durum. */
export interface RoomState {
  spaceId: string;
  status: SpaceStatus;
  participantCount: number;
  /** Çağıran kullanıcının bu odadaki rolü. */
  myRole: ParticipantRole;
  /** Partner katıldı mı? (iki katılımcı varsa `true`) */
  partnerJoined: boolean;
}
