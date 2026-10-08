import type { FeedScope, FeedSort, FollowListKind, ProfilePostKind } from "./types";

export const MAX_SOCIAL_POST_LENGTH = 1000;

/** Kendi profilin için kullanılan takma ad; gerçek kullanıcı adları en az 3 karakterdir. */
export const OWN_PROFILE_ALIAS = "me";

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T | undefined {
  if (value === null || value === undefined || value === "") return fallback;
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

export const normalizeFeedScope = (value: unknown): FeedScope | undefined =>
  oneOf(value, ["all", "following"] as const, "all");

export const normalizeFeedSort = (value: unknown): FeedSort | undefined =>
  oneOf(value, ["hot", "top", "new"] as const, "hot");

export const normalizeProfilePostKind = (value: unknown): ProfilePostKind | undefined =>
  oneOf(value, ["posts", "likes"] as const, "posts");

export const normalizeFollowListKind = (value: unknown): FollowListKind | undefined =>
  oneOf(value, ["followers", "following"] as const, "followers");

/**
 * Profil adresindeki kullanıcı adı. `me` çağıranın kendisi için null döner;
 * geçersiz biçim undefined döner.
 */
export function normalizeProfileUsername(value: unknown): string | null | undefined {
  if (typeof value !== "string") return undefined;
  const username = value.trim().toLowerCase();
  if (username === OWN_PROFILE_ALIAS) return null;
  return /^[a-z0-9_]{3,24}$/.test(username) ? username : undefined;
}

export function normalizeSocialBody(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const body = value.trim();
  return body.length >= 1 && body.length <= MAX_SOCIAL_POST_LENGTH ? body : null;
}

export function normalizeOptionalUuid(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined;
}

export interface SocialMovieInput {
  id: number;
  title: string;
  posterPath: string | null;
}

export function normalizeSocialMovie(value: unknown): SocialMovieInput | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const posterPath = record.posterPath;
  if (
    typeof record.id !== "number" ||
    !Number.isInteger(record.id) ||
    record.id <= 0 ||
    typeof record.title !== "string" ||
    record.title.trim().length < 1 ||
    record.title.trim().length > 300 ||
    !(
      posterPath === null ||
      (typeof posterPath === "string" && /^\/[A-Za-z0-9._-]+$/.test(posterPath))
    )
  ) {
    return undefined;
  }
  return { id: record.id, title: record.title.trim(), posterPath };
}
