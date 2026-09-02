/**
 * Oda özelliğinin uygulama sözleşmeleri.
 *
 * Yalnızca tip içerir; derleme sırasında silinir, bu yüzden istemci
 * bileşenlerinden güvenle import edilebilir.
 *
 * Bu tiplerin hiçbirinde `token_hash` veya düz metin token ALANI YOKTUR —
 * bu, sızıntıyı tip seviyesinde engeller.
 */

import type { TargetProviderKey } from "@/lib/tmdb/types";

export type ParticipantRole = "host" | "guest";
export type RoomVisibility = "private" | "public";

/**
 * Bir katılımcının sahip olduğu abonelik platformları.
 *
 * Oda oluştururken ve davete katılırken seçilir; tur adayları yalnızca iki
 * listenin KESİŞİMİNDEN toplanır (bkz. `subscriptions.ts`).
 */
export type RoomSubscriptions = TargetProviderKey[];
export type SpaceStatus = "active" | "closed";

/** Oda oluşturma sonucu. Düz metin token yalnızca `inviteUrl` içinde döner. */
export interface CreateRoomResult {
  spaceId: string;
  name: string;
  visibility: RoomVisibility;
  capacity: number;
  /** Tam davet bağlantısı. Kullanıcıya bir kez gösterilir; saklanmaz. */
  inviteUrl: string;
  /** Davetin son kullanma anı (ISO 8601, sunucuda üretilir). */
  invitationExpiresAt: string;
}

export interface RoomParticipant {
  userId: string;
  displayName: string;
  role: ParticipantRole;
  subscriptions: RoomSubscriptions;
  isMe: boolean;
}

/** Keşfet ekranında gösterilebilen, hassas alan içermeyen public oda özeti. */
export interface PublicRoomSummary {
  spaceId: string;
  name: string;
  capacity: number;
  participantCount: number;
  hostDisplayName: string;
  createdAt: string;
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
  name: string;
  visibility: RoomVisibility;
  capacity: number;
  status: SpaceStatus;
  participantCount: number;
  /** Çağıran kullanıcının bu odadaki rolü. */
  myRole: ParticipantRole;
  /** Film karar turu için gereken en az iki katılımcı var mı? */
  enoughParticipants: boolean;
  participants: RoomParticipant[];
  /** Çağıranın kendi abonelik seçimi. */
  mySubscriptions: RoomSubscriptions;
  /** Bütün katılımcı listelerinin kesişimi. */
  sharedSubscriptions: RoomSubscriptions;
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

/** Seçilen film için iki tarafın ortak Teleparty hazırlık durumu. */
export interface RoomTelepartyState {
  selectionId: string;
  /** Yalnızca çağıran da kabul ettiğinde iki kişilik ortak hazır olma bilgisi. */
  bothAccepted: boolean;
  /** İki taraf da hazır değilse veya host henüz paylaşmadıysa dönmez. */
  joinUrl: string | null;
}

/** Hafif Teleparty yoklama ucunun yanıtı; tur/aday verisini tekrar taşımaz. */
export interface RoomTelepartyResponse {
  telepartyStates: RoomTelepartyState[];
}

export interface RoomRoundState {
  round: RoomRound | null;
  /** Partner kabul bilgisi içermez; yalnızca çağıranın kendi durumu görünür. */
  pendingSelections: RoomSelection[];
  /** Kişi bazlı kabul verisi içermez; yalnızca ortak hazır olma kapısıdır. */
  telepartyStates: RoomTelepartyState[];
}
