import "server-only";

import {
  createSupabaseServerClient,
  getAuthenticatedUserId,
} from "@/lib/supabase/server";
import { toPosterUrl } from "@/lib/tmdb/normalize";
import {
  normalizeSocialError,
  socialError,
  type SocialError,
} from "./errors";
import {
  AVATAR_BUCKET,
  BANNER_BUCKET,
  publicStorageUrl,
} from "@/lib/supabase/storage-url";
import type { SocialMovieInput } from "./validation";
import type {
  FeedScope,
  FeedSort,
  FollowListKind,
  FollowPerson,
  ProfilePostKind,
  PublicProfile,
  SocialPost,
} from "./types";

export class SocialServiceError extends Error {
  readonly socialError: SocialError;

  constructor(error: SocialError) {
    super(error.message);
    this.name = "SocialServiceError";
    this.socialError = error;
  }
}

function fail(error: SocialError): never {
  throw new SocialServiceError(error);
}

async function authenticatedClient() {
  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) fail(socialError("not_configured"));
  if (!(await getAuthenticatedUserId(supabase))) fail(socialError("unauthenticated"));
  return supabase;
}

async function rpcRows(name: string, args: Record<string, unknown>): Promise<unknown[]> {
  const supabase = await authenticatedClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) fail(normalizeSocialError(error));
  if (!Array.isArray(data)) fail(socialError("unexpected"));
  return data;
}

export async function listSocialFeed(scope: FeedScope, sort: FeedSort): Promise<SocialPost[]> {
  const rows = await rpcRows("list_social_feed", { p_scope: scope, p_sort: sort, p_limit: 30 });
  return rows.map(parsePost);
}

export async function listSocialReplies(parentPostId: string): Promise<SocialPost[]> {
  const rows = await rpcRows("list_social_replies", { p_parent_post_id: parentPostId, p_limit: 50 });
  return rows.map(parsePost);
}

/** `username` null ise çağıranın kendi profili. */
export async function getPublicProfile(username: string | null): Promise<PublicProfile> {
  const rows = await rpcRows("get_social_profile", { p_username: username });
  if (rows.length === 0) fail(socialError("profile_not_found"));
  const item = record(rows[0]);
  const counts = [item.follower_count, item.following_count, item.post_count];
  if (
    typeof item.display_name !== "string" ||
    typeof item.created_at !== "string" ||
    counts.some((value) => typeof value !== "number") ||
    typeof item.is_me !== "boolean" ||
    typeof item.followed_by_me !== "boolean" ||
    typeof item.follows_me !== "boolean"
  ) {
    fail(socialError("unexpected"));
  }
  return {
    username: optionalText(item.username),
    displayName: item.display_name,
    bio: optionalText(item.bio),
    avatarUrl: publicStorageUrl(AVATAR_BUCKET, item.avatar_path),
    bannerUrl: publicStorageUrl(BANNER_BUCKET, item.banner_path),
    createdAt: item.created_at,
    followerCount: item.follower_count as number,
    followingCount: item.following_count as number,
    postCount: item.post_count as number,
    isMe: item.is_me,
    followedByMe: item.followed_by_me,
    followsMe: item.follows_me,
  };
}

export async function listProfilePosts(
  username: string | null,
  kind: ProfilePostKind,
): Promise<SocialPost[]> {
  const rows = await rpcRows("list_profile_posts", { p_username: username, p_kind: kind, p_limit: 30 });
  return rows.map(parsePost);
}

export async function listFollows(
  username: string | null,
  kind: FollowListKind,
): Promise<FollowPerson[]> {
  const rows = await rpcRows("list_follows", { p_username: username, p_kind: kind, p_limit: 50 });
  return rows.map((row) => {
    const item = record(row);
    if (
      typeof item.username !== "string" ||
      typeof item.display_name !== "string" ||
      typeof item.followed_by_me !== "boolean" ||
      typeof item.is_me !== "boolean"
    ) {
      fail(socialError("unexpected"));
    }
    return {
      username: item.username,
      displayName: item.display_name,
      bio: optionalText(item.bio),
      avatarUrl: publicStorageUrl(AVATAR_BUCKET, item.avatar_path),
      followedByMe: item.followed_by_me,
      isMe: item.is_me,
    };
  });
}

/** Takip et / takibi bırak. Yeni durumda takip ediliyorsa true döner. */
export async function toggleFollow(username: string): Promise<boolean> {
  const supabase = await authenticatedClient();
  const { data, error } = await supabase.rpc("toggle_follow", { p_username: username });
  if (error) fail(normalizeSocialError(error));
  if (typeof data !== "boolean") fail(socialError("unexpected"));
  return data;
}

function record(row: unknown): Record<string, unknown> {
  if (!row || typeof row !== "object") fail(socialError("unexpected"));
  return row as Record<string, unknown>;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export async function deleteSocialPost(postId: string): Promise<void> {
  const supabase = await authenticatedClient();
  const { error } = await supabase.rpc("delete_social_post", {
    p_post_id: postId,
  });
  if (error) fail(normalizeSocialError(error));
}

export async function createSocialPost(input: {
  body: string;
  parentPostId: string | null;
  movie: SocialMovieInput | null;
}): Promise<string> {
  const supabase = await authenticatedClient();
  const { data, error } = await supabase.rpc("create_social_post", {
    p_body: input.body,
    p_parent_post_id: input.parentPostId,
    p_tmdb_movie_id: input.movie?.id ?? null,
    p_movie_title: input.movie?.title ?? null,
    p_movie_poster_path: input.movie?.posterPath ?? null,
  });
  if (error) fail(normalizeSocialError(error));
  if (typeof data !== "string") fail(socialError("unexpected"));
  return data;
}

export async function toggleSocialReaction(
  postId: string,
  reaction: "like" | "repost",
): Promise<boolean> {
  const supabase = await authenticatedClient();
  const functionName =
    reaction === "like" ? "toggle_social_post_like" : "toggle_social_post_repost";
  const { data, error } = await supabase.rpc(functionName, { p_post_id: postId });
  if (error) fail(normalizeSocialError(error));
  if (typeof data !== "boolean") fail(socialError("unexpected"));
  return data;
}

function parsePost(row: unknown): SocialPost {
  if (!row || typeof row !== "object") fail(socialError("unexpected"));
  const record = row as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.author_display_name !== "string" ||
    typeof record.body !== "string" ||
    typeof record.created_at !== "string" ||
    typeof record.like_count !== "number" ||
    typeof record.reply_count !== "number" ||
    typeof record.repost_count !== "number" ||
    typeof record.liked_by_me !== "boolean" ||
    typeof record.reposted_by_me !== "boolean" ||
    typeof record.is_mine !== "boolean"
  ) {
    fail(socialError("unexpected"));
  }

  const hasMovie =
    typeof record.tmdb_movie_id === "number" && typeof record.movie_title === "string";
  return {
    id: record.id,
    authorUsername: optionalText(record.author_username),
    authorDisplayName: record.author_display_name,
    authorAvatarUrl: publicStorageUrl(AVATAR_BUCKET, record.author_avatar_path),
    body: record.body,
    movie: hasMovie
      ? {
          id: record.tmdb_movie_id as number,
          title: record.movie_title as string,
          posterPath:
            typeof record.movie_poster_path === "string"
              ? record.movie_poster_path
              : null,
          posterUrl: toPosterUrl(
            typeof record.movie_poster_path === "string"
              ? record.movie_poster_path
              : null,
          ),
        }
      : null,
    createdAt: record.created_at,
    likeCount: record.like_count,
    replyCount: record.reply_count,
    repostCount: record.repost_count,
    likedByMe: record.liked_by_me,
    repostedByMe: record.reposted_by_me,
    isMine: record.is_mine,
    latestReposterDisplayName:
      typeof record.latest_reposter_display_name === "string"
        ? record.latest_reposter_display_name
        : null,
  };
}
