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
} from "./localStore";
import { normalizeRoomError, roomError, type RoomError } from "./errors";
import {
  buildInvitationUrl,
  generateInvitationToken,
  hashInvitationToken,
  isValidInvitationTokenFormat,
} from "./tokens";
import type { CreateRoomResult, JoinRoomResult, RoomState } from "./types";

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
  localUserId?: string,
): Promise<CreateRoomResult> {
  // Arka uç seçimi tek yerden gelir (bkz. `backend.ts`).
  if (isLocalRoomsBackend()) {
    if (!localUserId) fail(roomError("unauthenticated"));
    return createRoomLocal(baseUrl, localUserId);
  }

  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) fail(roomError("not_configured"));

  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) fail(roomError("unauthenticated"));

  const token = generateInvitationToken();
  const tokenHash = hashInvitationToken(token);

  const { data, error } = await supabase.rpc("create_space", {
    p_token_hash: tokenHash,
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

  return { spaceId: data, inviteUrl, invitationExpiresAt };
}

/**
 * Davet token'ını tüketir ve kullanıcıyı misafir olarak odaya ekler.
 *
 * Token burada hash'lenir; veritabanına düz metin gitmez.
 */
export async function joinRoom(
  token: unknown,
  localUserId?: string,
): Promise<JoinRoomResult> {
  // Biçim kontrolü, geçersiz token'ın veritabanına hiç ulaşmamasını sağlar.
  if (!isValidInvitationTokenFormat(token)) {
    fail(roomError("invalid_invitation"));
  }

  if (isLocalRoomsBackend()) {
    if (!localUserId) fail(roomError("unauthenticated"));
    return joinRoomLocal(token as string, localUserId);
  }

  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) fail(roomError("not_configured"));

  const userId = await getAuthenticatedUserId(supabase);
  if (!userId) fail(roomError("unauthenticated"));

  const { data, error } = await supabase.rpc("join_space_with_invitation", {
    p_token_hash: hashInvitationToken(token),
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
    .select("id, status")
    .eq("id", spaceId)
    .maybeSingle();

  if (spaceError) fail(normalizeRoomError(spaceError));
  // RLS nedeniyle katılımcı olmayan için boş döner: varlık bilgisi sızdırmamak
  // adına "geçersiz" olarak ele alınır.
  if (!space) fail(roomError("invalid_invitation"));

  const { data: participants, error: participantsError } = await supabase
    .from("participants")
    .select("user_id, role")
    .eq("space_id", spaceId);

  if (participantsError) fail(normalizeRoomError(participantsError));

  const rows = participants ?? [];
  const mine = rows.find((p) => p.user_id === userId);
  if (!mine) fail(roomError("invalid_invitation"));

  const status = space.status === "closed" ? "closed" : "active";
  const myRole = mine.role === "host" ? "host" : "guest";

  return {
    spaceId,
    status,
    participantCount: rows.length,
    myRole,
    partnerJoined: rows.length >= 2,
  };
}
