import "server-only";

import {
  createSupabaseServerClient,
  getAuthenticatedUserId,
} from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isLocalRoomsBackend } from "./backend";
import {
  createRoomLocal,
  closeRoomLocal,
  getListedRoomAccessLocal,
  joinRoomLocal,
  getRoomStateLocal,
  joinPublicRoomLocal,
  joinPrivateRoomLocal,
  kickRoomParticipantLocal,
  listPublicRoomsLocal,
  leaveRoomLocal,
  getRoomMessagesLocal,
  sendRoomMessageLocal,
  setRoomSubscriptionsLocal,
} from "./localStore";
import { hashRoomPassword, verifyRoomPassword } from "./password";
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
  RoomChatMessage,
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
  options: {
    name: string;
    visibility: RoomVisibility;
    capacity: number;
    password: string | null;
  },
  localUserId?: string,
): Promise<CreateRoomResult> {
  // Sunucu sınırındaki son kontrol: aboneliksiz oda, ortak küme üretemez ve
  // hiç tur başlatamaz. Bu yüzden oluşturma aşamasında reddedilir.
  if (subscriptions.length === 0) fail(roomError("subscriptions_required"));
  if (options.visibility === "private" && !options.password) {
    fail(roomError("room_password_required"));
  }

  const passwordHash =
    options.visibility === "private" && options.password
      ? await hashRoomPassword(options.password)
      : null;

  // Arka uç seçimi tek yerden gelir (bkz. `backend.ts`).
  if (isLocalRoomsBackend()) {
    if (!localUserId) fail(roomError("unauthenticated"));
    return createRoomLocal(baseUrl, subscriptions, localUserId, {
      ...options,
      isRegistered: true,
      passwordHash,
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
    p_password_hash: passwordHash,
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

  const { data, error } = await supabase.rpc("list_discoverable_spaces");
  if (error) fail(normalizeRoomError(error));
  if (!Array.isArray(data)) fail(roomError("unexpected"));

  return data.map((row) => {
    if (!row || typeof row !== "object") fail(roomError("unexpected"));
    const record = row as Record<string, unknown>;
    if (
      typeof record.space_id !== "string" ||
      typeof record.name !== "string" ||
      (record.visibility !== "private" && record.visibility !== "public") ||
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
      visibility: record.visibility,
      capacity: record.capacity,
      participantCount: record.participant_count,
      hostDisplayName: record.host_display_name,
      createdAt: record.created_at,
    };
  });
}

/** Listed public/private room join. Private passwords are verified server-side. */
export async function joinListedRoom(
  spaceId: string,
  subscriptions: RoomSubscriptions,
  password: string | null,
  localUserId?: string,
): Promise<JoinRoomResult> {
  if (subscriptions.length === 0) fail(roomError("subscriptions_required"));

  if (isLocalRoomsBackend()) {
    if (!localUserId) fail(roomError("unauthenticated"));
    const access = getListedRoomAccessLocal(spaceId);
    if (!access) fail(roomError("invalid_invitation"));
    if (access.visibility === "public") {
      return joinPublicRoomLocal(spaceId, subscriptions, localUserId, true);
    }
    if (!password || !access.passwordHash) fail(roomError("room_password_required"));
    if (!(await verifyRoomPassword(password, access.passwordHash))) {
      fail(roomError("invalid_room_password"));
    }
    return joinPrivateRoomLocal(spaceId, subscriptions, localUserId);
  }

  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) fail(roomError("not_configured"));
  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) fail(roomError("unauthenticated"));

  const admin = createSupabaseAdminClient();
  const { data: space, error: spaceError } = await admin
    .from("spaces")
    .select("visibility, status")
    .eq("id", spaceId)
    .maybeSingle();
  if (spaceError) fail(normalizeRoomError(spaceError));
  if (!space) fail(roomError("invalid_invitation"));
  if (space.status !== "active") fail(roomError("room_closed"));

  if (space.visibility === "public") {
    return joinPublicRoom(spaceId, subscriptions);
  }
  if (space.visibility !== "private") fail(roomError("invalid_invitation"));
  if (!password) fail(roomError("room_password_required"));

  const { data: secret, error: secretError } = await admin
    .from("space_passwords")
    .select("password_hash")
    .eq("space_id", spaceId)
    .maybeSingle();
  if (secretError) fail(normalizeRoomError(secretError));
  if (!secret || typeof secret.password_hash !== "string") {
    fail(roomError("invalid_invitation"));
  }
  if (!(await verifyRoomPassword(password, secret.password_hash))) {
    fail(roomError("invalid_room_password"));
  }

  const { data, error } = await admin.rpc("join_private_space_as_actor", {
    p_space_id: spaceId,
    p_actor_id: userId,
    p_subscriptions: subscriptions,
  });
  if (error) fail(normalizeRoomError(error));
  return parseJoinResult(spaceId, data);
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

  return parseJoinResult(spaceId, data);
}

function parseJoinResult(spaceId: string, data: unknown): JoinRoomResult {
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

export async function leaveRoom(
  spaceId: string,
  localUserId?: string,
): Promise<void> {
  if (isLocalRoomsBackend()) {
    if (!localUserId) fail(roomError("unauthenticated"));
    leaveRoomLocal(spaceId, localUserId);
    return;
  }
  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) fail(roomError("not_configured"));
  if (!(await getAuthenticatedUserId(supabase))) fail(roomError("unauthenticated"));
  const { error } = await supabase.rpc("leave_space", { p_space_id: spaceId });
  if (error) fail(normalizeRoomError(error));
}

export async function closeRoom(
  spaceId: string,
  localUserId?: string,
): Promise<void> {
  if (isLocalRoomsBackend()) {
    if (!localUserId) fail(roomError("unauthenticated"));
    closeRoomLocal(spaceId, localUserId);
    return;
  }
  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) fail(roomError("not_configured"));
  if (!(await getAuthenticatedUserId(supabase))) fail(roomError("unauthenticated"));
  const { error } = await supabase.rpc("close_space", { p_space_id: spaceId });
  if (error) fail(normalizeRoomError(error));
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

export async function getRoomMessages(
  spaceId: string,
  localUserId?: string,
): Promise<RoomChatMessage[]> {
  if (isLocalRoomsBackend()) {
    if (!localUserId) fail(roomError("unauthenticated"));
    return getRoomMessagesLocal(spaceId, localUserId);
  }

  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) fail(roomError("not_configured"));
  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) fail(roomError("unauthenticated"));

  const { data, error } = await supabase.rpc("get_space_messages", {
    p_space_id: spaceId,
    p_limit: 50,
  });
  if (error) fail(normalizeRoomError(error));
  if (!Array.isArray(data)) fail(roomError("unexpected"));

  return data.map((row) => {
    if (!row || typeof row !== "object") fail(roomError("unexpected"));
    const record = row as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof record.sender_display_name !== "string" ||
      typeof record.body !== "string" ||
      typeof record.created_at !== "string" ||
      typeof record.is_mine !== "boolean"
    ) {
      fail(roomError("unexpected"));
    }
    return {
      id: record.id,
      senderDisplayName: record.sender_display_name,
      body: record.body,
      createdAt: record.created_at,
      isMine: record.is_mine,
    };
  });
}

export async function sendRoomMessage(
  spaceId: string,
  body: string,
  localUserId?: string,
): Promise<void> {
  if (isLocalRoomsBackend()) {
    if (!localUserId) fail(roomError("unauthenticated"));
    sendRoomMessageLocal(spaceId, body, localUserId);
    return;
  }

  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) fail(roomError("not_configured"));
  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) fail(roomError("unauthenticated"));

  const { error } = await supabase.rpc("send_space_message", {
    p_space_id: spaceId,
    p_body: body,
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
      displayName: participantDisplayName(participant, index),
      role: participant.role === "host" ? "host" : "guest",
      subscriptions: parseStoredSubscriptions(participant.subscriptions),
      isMe: participant.user_id === userId,
    })),
    mySubscriptions,
    sharedSubscriptions: sharedSubscriptionsForAll(participantSubscriptions),
  };
}

function participantDisplayName(
  participant: {
    user_id: string;
    role: unknown;
    display_name: unknown;
  },
  index: number,
): string {
  const stored =
    typeof participant.display_name === "string"
      ? participant.display_name.trim()
      : "";
  const fallback =
    participant.role === "host" ? "Oda sahibi" : `Katılımcı ${index + 1}`;
  const base = stored || fallback;
  if (
    base === "Anonim misafir" ||
    base === "Anonim oda sahibi" ||
    base === "WatchMuse üyesi"
  ) {
    return `${base} ${participant.user_id.slice(0, 4).toUpperCase()}`;
  }
  return base;
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
