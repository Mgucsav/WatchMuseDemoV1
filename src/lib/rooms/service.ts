import "server-only";

import {
  createSupabaseServerClient,
  getAuthenticatedUserId,
} from "@/lib/supabase/server";
import { isLocalRoomsBackend } from "./backend";
import {
  createRoomLocal,
  joinRoomLocal,
  getRoomStateLocal,
  joinPublicRoomLocal,
  kickRoomParticipantLocal,
  listPublicRoomsLocal,
  setRoomSubscriptionsLocal,
} from "./localStore";
import { normalizeRoomError, roomError, type RoomError } from "./errors";
import {
  buildInvitationUrl,
  generateInvitationToken,
  hashInvitationToken,
  isValidInvitationTokenFormat,
} from "./tokens";
import {
  parseStoredSubscriptions,
  sharedSubscriptionsForAll,
} from "./subscriptions";
import type {
  CreateRoomResult,
  JoinRoomResult,
  PublicRoomSummary,
  RoomState,
  RoomSubscriptions,
  RoomVisibility,
} from "./types";

/**
 * Sunucu-only oda servisi.
 *
 * Düz metin davet token'ı YALNIZCA bu modülde üretilir ve yalnızca dönen
 * `inviteUrl` içinde dışarı çıkar. Veritabanına daima SHA-256 özeti gider.
 * Token hiçbir yerde loglanmaz.
 */

export class RoomServiceError extends Error {
  readonly roomError: RoomError;

  constructor(error: RoomError) {
    super(error.message);
    this.name = "RoomServiceError";
    this.roomError = error;
  }
}

function fail(error: RoomError): never {
  throw new RoomServiceError(error);
}

/**
 * Oda oluşturur ve davet bağlantısını döndürür.
 *
 * Sıra önemlidir: bağlantı YALNIZCA veritabanı işlemi başarılı olduktan sonra
 * kurulur; başarısız bir oluşturmada kullanıcıya asla çalışmayan bir davet
 * gösterilmez.
 */
export async function createRoom(
  baseUrl: string,
  subscriptions: RoomSubscriptions,
  options: { name: string; visibility: RoomVisibility; capacity: number },
  localUserId?: string,
): Promise<CreateRoomResult> {
  // Sunucu sınırındaki son kontrol: aboneliksiz oda, ortak küme üretemez ve
  // hiç tur başlatamaz. Bu yüzden oluşturma aşamasında reddedilir.
  if (subscriptions.length === 0) fail(roomError("subscriptions_required"));

  // Arka uç seçimi tek yerden gelir (bkz. `backend.ts`).
  if (isLocalRoomsBackend()) {
    if (!localUserId) fail(roomError("unauthenticated"));
    return createRoomLocal(baseUrl, subscriptions, localUserId, {
      ...options,
      isRegistered: false,
    });
  }

  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) fail(roomError("not_configured"));

  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) fail(roomError("unauthenticated"));

  const token = generateInvitationToken();
  const tokenHash = hashInvitationToken(token);

  const { data, error } = await supabase.rpc("create_space", {
    p_token_hash: tokenHash,
    p_subscriptions: subscriptions,
    p_visibility: options.visibility,
    p_name: options.name,
    p_capacity: options.capacity,
  });

  if (error) fail(normalizeRoomError(error));
  if (typeof data !== "string" || data === "") fail(roomError("unexpected"));

  // Veritabanı başarılı; bağlantı ancak şimdi kuruluyor.
  const inviteUrl = buildInvitationUrl(baseUrl, token);

  // Son kullanma bilgisi kullanıcıya gösterilir. Veritabanındaki sabitle (24s)
  // aynı olmalıdır; yalnızca bilgilendirme amaçlıdır, yetkilendirme değil.
  const invitationExpiresAt = new Date(
    Date.now() + 24 * 60 * 60 * 1000,
  ).toISOString();

  return {
    spaceId: data,
    name: options.name,
    visibility: options.visibility,
    capacity: options.capacity,
    inviteUrl,
    invitationExpiresAt,
  };
}

/** Hassas davet veya kullanıcı kimliği taşımayan public oda vitrini. */
export async function listPublicRooms(): Promise<PublicRoomSummary[]> {
  if (isLocalRoomsBackend()) return listPublicRoomsLocal();

  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) fail(roomError("not_configured"));

  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) fail(roomError("unauthenticated"));

  const { data, error } = await supabase.rpc("list_public_spaces");
  if (error) fail(normalizeRoomError(error));
  if (!Array.isArray(data)) fail(roomError("unexpected"));

  return data.map((row) => {
    if (!row || typeof row !== "object") fail(roomError("unexpected"));
    const record = row as Record<string, unknown>;
    if (
      typeof record.space_id !== "string" ||
      typeof record.name !== "string" ||
      typeof record.capacity !== "number" ||
      typeof record.participant_count !== "number" ||
      typeof record.host_display_name !== "string" ||
      typeof record.created_at !== "string"
    ) {
      fail(roomError("unexpected"));
    }
    return {
      spaceId: record.space_id,
      name: record.name,
      capacity: record.capacity,
      participantCount: record.participant_count,
      hostDisplayName: record.host_display_name,
      createdAt: record.created_at,
    };
  });
}

/** Kayıtlı kullanıcıyı davet tokenı olmadan public odaya ekler. */
export async function joinPublicRoom(
  spaceId: string,
  subscriptions: RoomSubscriptions,
  localUserId?: string,
): Promise<JoinRoomResult> {
  if (subscriptions.length === 0) fail(roomError("subscriptions_required"));

  if (isLocalRoomsBackend()) {
    if (!localUserId) fail(roomError("unauthenticated"));
    return joinPublicRoomLocal(spaceId, subscriptions, localUserId, false);
  }

  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) fail(roomError("not_configured"));
  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) fail(roomError("unauthenticated"));

  const { data, error } = await supabase.rpc("join_public_space", {
    p_space_id: spaceId,
    p_subscriptions: subscriptions,
  });
  if (error) fail(normalizeRoomError(error));

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") fail(roomError("unexpected"));
  const record = row as Record<string, unknown>;
  const role = record.role;
  if (role !== "host" && role !== "guest") fail(roomError("unexpected"));
  return {
    spaceId,
    role,
    alreadyMember: record.already_member === true,
  };
}

/** Oda sahibinin bir katılımcıyı çıkarıp aynı odaya dönüşünü engellemesi. */
export async function kickRoomParticipant(
  spaceId: string,
  participantUserId: string,
  localUserId?: string,
): Promise<void> {
  if (isLocalRoomsBackend()) {
    if (!localUserId) fail(roomError("unauthenticated"));
    kickRoomParticipantLocal(spaceId, participantUserId, localUserId);
    return;
  }

  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) fail(roomError("not_configured"));
  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) fail(roomError("unauthenticated"));

  const { error } = await supabase.rpc("kick_space_participant", {
    p_space_id: spaceId,
    p_target_user_id: participantUserId,
  });
  if (error) fail(normalizeRoomError(error));
}

/**
 * Davet token'ını tüketir ve kullanıcıyı misafir olarak odaya ekler.
 *
 * Token burada hash'lenir; veritabanına düz metin gitmez.
 */
export async function joinRoom(
  token: unknown,
  subscriptions: RoomSubscriptions,
  localUserId?: string,
): Promise<JoinRoomResult> {
  // Biçim kontrolü, geçersiz token'ın veritabanına hiç ulaşmamasını sağlar.
  if (!isValidInvitationTokenFormat(token)) {
    fail(roomError("invalid_invitation"));
  }

  if (subscriptions.length === 0) fail(roomError("subscriptions_required"));

  if (isLocalRoomsBackend()) {
    if (!localUserId) fail(roomError("unauthenticated"));
    return joinRoomLocal(token as string, subscriptions, localUserId);
  }

  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) fail(roomError("not_configured"));

  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) fail(roomError("unauthenticated"));

  const { data, error } = await supabase.rpc("join_space_with_invitation", {
    p_token_hash: hashInvitationToken(token),
    p_subscriptions: subscriptions,
  });

  if (error) fail(normalizeRoomError(error));

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") fail(roomError("unexpected"));

  const record = row as Record<string, unknown>;
  const spaceId = record.space_id;
  const role = record.role;

  if (typeof spaceId !== "string" || (role !== "host" && role !== "guest")) {
    fail(roomError("unexpected"));
  }

  return {
    spaceId,
    role,
    alreadyMember: record.already_member === true,
  };
}

/**
 * Bekleme odasının durumunu döndürür.
 *
 * Yetkilendirme RLS tarafından yapılır: kullanıcı odanın katılımcısı değilse
 * sorgular boş döner ve burada `invalid_invitation` üretilir. Tarayıcıdan
 * gelen `spaceId` değerine asla doğrudan güvenilmez.
 */
export async function getRoomState(
  spaceId: string,
  localUserId?: string,
): Promise<RoomState> {
  if (isLocalRoomsBackend()) {
    if (!localUserId) fail(roomError("unauthenticated"));
    return getRoomStateLocal(spaceId, localUserId);
  }

  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) fail(roomError("not_configured"));

  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) fail(roomError("unauthenticated"));

  const { data: space, error: spaceError } = await supabase
    .from("spaces")
    .select("id, name, visibility, capacity, status")
    .eq("id", spaceId)
    .maybeSingle();

  if (spaceError) fail(normalizeRoomError(spaceError));
  // RLS nedeniyle katılımcı olmayan için boş döner: varlık bilgisi sızdırmamak
  // adına "geçersiz" olarak ele alınır.
  if (!space) fail(roomError("invalid_invitation"));

  const { data: participants, error: participantsError } = await supabase
    .from("participants")
    .select("user_id, role, display_name, subscriptions")
    .eq("space_id", spaceId);

  if (participantsError) fail(normalizeRoomError(participantsError));

  const rows = participants ?? [];
  const mine = rows.find((p) => p.user_id === userId);
  if (!mine) fail(roomError("invalid_invitation"));

  const status = space.status === "closed" ? "closed" : "active";
  const visibility = space.visibility === "public" ? "public" : "private";
  const myRole = mine.role === "host" ? "host" : "guest";
  const mySubscriptions = parseStoredSubscriptions(mine.subscriptions);
  const participantSubscriptions = rows.map((participant) =>
    parseStoredSubscriptions(participant.subscriptions),
  );

  return {
    spaceId,
    name: typeof space.name === "string" ? space.name : "Karar odası",
    visibility,
    capacity:
      typeof space.capacity === "number" && Number.isInteger(space.capacity)
        ? space.capacity
        : 2,
    status,
    participantCount: rows.length,
    myRole,
    enoughParticipants: rows.length >= 2,
    participants: rows.map((participant, index) => ({
      userId: participant.user_id,
      displayName:
        typeof participant.display_name === "string" &&
        participant.display_name.trim() !== ""
          ? participant.display_name.trim()
          : participant.role === "host"
            ? "Oda sahibi"
            : `Katılımcı ${index + 1}`,
      role: participant.role === "host" ? "host" : "guest",
      subscriptions: parseStoredSubscriptions(participant.subscriptions),
      isMe: participant.user_id === userId,
    })),
    mySubscriptions,
    sharedSubscriptions: sharedSubscriptionsForAll(participantSubscriptions),
  };
}

/**
 * Çağıranın KENDİ abonelik seçimini günceller.
 *
 * Yalnızca çağıranın kendi satırı değişir (veritabanı `auth.uid()` ile
 * kısıtlar). Değişiklik AKTİF turu etkilemez: o turun adayları zaten
 * kalıcılaştırılmıştır. Yeni kesişim bir sonraki turdan itibaren geçerlidir.
 */
export async function updateMySubscriptions(
  spaceId: string,
  subscriptions: RoomSubscriptions,
  localUserId?: string,
): Promise<RoomState> {
  if (subscriptions.length === 0) fail(roomError("subscriptions_required"));

  if (isLocalRoomsBackend()) {
    if (!localUserId) fail(roomError("unauthenticated"));
    setRoomSubscriptionsLocal(spaceId, subscriptions, localUserId);
    return getRoomStateLocal(spaceId, localUserId);
  }

  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) fail(roomError("not_configured"));

  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) fail(roomError("unauthenticated"));

  const { error } = await supabase.rpc("set_participant_subscriptions", {
    p_space_id: spaceId,
    p_subscriptions: subscriptions,
  });

  if (error) fail(normalizeRoomError(error));

  return getRoomState(spaceId);
}
