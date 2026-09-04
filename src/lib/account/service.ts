import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { accountError, normalizeAccountError } from "./errors";
import type {
  DirectMessage, DmPrivacy, DmThread, SocialPerson, SocialProfile,
  SocialRelationship,
} from "./types";

const AVATAR_BUCKET = "profile-avatars";

async function client() {
  return createSupabaseServerClient().catch(() => {
    throw accountError("not_configured");
  });
}

function avatarUrl(path: unknown): string | null {
  if (typeof path !== "string" || path === "") return null;
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  return configured
    ? `${configured}/storage/v1/object/public/${AVATAR_BUCKET}/${path}`
    : null;
}

function row(value: unknown): Record<string, unknown> {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== "object") throw accountError("unexpected");
  return candidate as Record<string, unknown>;
}

function text(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string") throw accountError("unexpected");
  return value;
}

function relationship(value: unknown): SocialRelationship {
  if (value === "none" || value === "incoming" || value === "outgoing" || value === "friends") return value;
  throw accountError("unexpected");
}

function parsePerson(value: unknown): SocialPerson {
  const item = row(value);
  if (typeof item.can_message !== "boolean") throw accountError("unexpected");
  return {
    userId: text(item.user_id)!,
    username: text(item.username)!,
    displayName: text(item.display_name)!,
    bio: text(item.bio, true),
    avatarUrl: avatarUrl(item.avatar_path),
    relationship: relationship(item.relationship),
    canMessage: item.can_message,
    ...(typeof item.updated_at === "string" ? { updatedAt: item.updated_at } : {}),
  };
}

export async function getMySocialProfile(): Promise<SocialProfile> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("get_my_social_profile");
  if (error) throw normalizeAccountError(error);
  const item = row(data);
  const privacy = item.dm_privacy;
  if (privacy !== "everyone" && privacy !== "friends" && privacy !== "nobody") throw accountError("unexpected");
  return {
    userId: text(item.user_id)!,
    username: text(item.username, true),
    displayName: text(item.display_name, true),
    bio: text(item.bio, true),
    avatarUrl: avatarUrl(item.avatar_path),
    dmPrivacy: privacy,
    createdAt: text(item.created_at)!,
  };
}

export async function updateMySocialProfile(input: {
  username: string; displayName: string; bio: string; dmPrivacy: DmPrivacy;
}): Promise<SocialProfile> {
  const supabase = await client();
  const { error } = await supabase.rpc("update_my_social_profile", {
    p_username: input.username,
    p_display_name: input.displayName,
    p_bio: input.bio,
    p_dm_privacy: input.dmPrivacy,
  });
  if (error) throw normalizeAccountError(error);
  return getMySocialProfile();
}

export async function setMyAvatarPath(path: string | null): Promise<void> {
  const supabase = await client();
  const { error } = await supabase.rpc("set_my_avatar_path", { p_avatar_path: path });
  if (error) throw normalizeAccountError(error);
}

export async function searchPeople(query: string): Promise<SocialPerson[]> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("search_social_profiles", { p_query: query, p_limit: 20 });
  if (error) throw normalizeAccountError(error);
  if (!Array.isArray(data)) throw accountError("unexpected");
  return data.map(parsePerson);
}

export async function listConnections(): Promise<SocialPerson[]> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("list_social_connections");
  if (error) throw normalizeAccountError(error);
  if (!Array.isArray(data)) throw accountError("unexpected");
  return data.map(parsePerson);
}

async function mutation(name: string, args: Record<string, unknown>) {
  const supabase = await client();
  const { error } = await supabase.rpc(name, args);
  if (error) throw normalizeAccountError(error);
}

export const requestFriendship = (userId: string) => mutation("request_friendship", { p_user_id: userId });
export const respondFriendship = (userId: string, accept: boolean) => mutation("respond_friendship", { p_user_id: userId, p_accept: accept });
export const removeConnection = (userId: string) => mutation("remove_social_connection", { p_user_id: userId });

export async function listMessages(userId: string): Promise<DirectMessage[]> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("list_direct_messages", { p_other_user_id: userId, p_limit: 100 });
  if (error) throw normalizeAccountError(error);
  if (!Array.isArray(data)) throw accountError("unexpected");
  return data.map((value) => {
    const item = row(value);
    if (typeof item.is_mine !== "boolean") throw accountError("unexpected");
    return { id: text(item.id)!, senderId: text(item.sender_id)!, body: text(item.body)!, createdAt: text(item.created_at)!, isMine: item.is_mine };
  });
}

export async function sendMessage(userId: string, body: string): Promise<void> {
  await mutation("send_direct_message", { p_recipient_id: userId, p_body: body });
}

export async function listThreads(): Promise<DmThread[]> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("list_dm_threads");
  if (error) throw normalizeAccountError(error);
  if (!Array.isArray(data)) throw accountError("unexpected");
  return data.map((value) => {
    const item = row(value);
    if (typeof item.unread_count !== "number") throw accountError("unexpected");
    return {
      userId: text(item.user_id)!, username: text(item.username)!, displayName: text(item.display_name)!,
      avatarUrl: avatarUrl(item.avatar_path), lastBody: text(item.last_body)!,
      lastMessageAt: text(item.last_message_at)!, unreadCount: item.unread_count,
    };
  });
}

export { AVATAR_BUCKET };
