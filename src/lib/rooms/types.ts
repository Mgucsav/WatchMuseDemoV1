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

/** Bir aday için gizli karar. Yalnızca karar veren kullanıcı kendi değerini görür. */
export type RoomVoteChoice = "skip" | "maybe" | "want";

export type RoomRoundStatus =
  | "voting"
  | "matching"
  | "spinning"
  | "result"
  | "no_match";

/** Aynı sırayla iki katılımcıya da gönderilen, sunucuda saklanmış aday film. */
export interface RoomCandidate {
  id: string;
  position: number;
  tmdbMovieId: number;
  title: string;
  originalTitle: string | null;
  posterPath: string | null;
  posterUrl: string | null;
  overview: string | null;
  releaseYear: number | null;
  voteAverage: number | null;
}

/** Gizli seçim turunun istemciye güvenle sunulabilen özeti. */
export interface RoomRound {
  id: string;
  roundNumber: number;
  status: RoomRoundStatus;
  candidateCount: number;
  candidates: RoomCandidate[];
  /** Yalnızca çağıranın kendi seçimleri. */
  myVotes: Record<string, RoomVoteChoice>;
  myVoteCount: number;
  /** Partnerin hangi filmleri seçtiğini değil, yalnızca tamamlayıp tamamlamadığını söyler. */
  partnerCompleted: boolean;
  /** İki taraf da seçimleri bitirince görünür. */
  matchedCandidates: RoomCandidate[];
  /** Çark başladıktan sonra ortak animasyon için sunucunun seçtiği aday. */
  winnerCandidate: RoomCandidate | null;
  spinStartedAt: string | null;
  spinDurationMs: number;
}

/** Çarkın seçtiği, yedi günlük kişisel izleme-listesi penceresindeki film. */
export interface RoomSelection {
  id: string;
  tmdbMovieId: number;
  title: string;
  posterPath: string | null;
  posterUrl: string | null;
  selectedAt: string;
  responseDeadline: string;
  /** Yalnızca çağıran katılımcının kendi kabul olayı. */
  myAccepted: boolean;
}

export interface RoomRoundState {
  round: RoomRound | null;
  /** Partner kabul bilgisi içermez; yalnızca çağıranın kendi durumu görünür. */
  pendingSelections: RoomSelection[];
}
