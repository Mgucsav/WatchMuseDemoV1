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
import type { SocialMovieInput } from "./validation";
import type { SocialPost } from "./types";

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

export async function listSocialPosts(parentPostId: string | null): Promise<SocialPost[]> {
  const supabase = await authenticatedClient();
  const { data, error } = await supabase.rpc("list_social_posts_v2", {
    p_parent_post_id: parentPostId,
    p_limit: parentPostId ? 50 : 30,
  });
  if (error) fail(normalizeSocialError(error));
  if (!Array.isArray(data)) fail(socialError("unexpected"));
  return data.map(parsePost);
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
    authorDisplayName: record.author_display_name,
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
