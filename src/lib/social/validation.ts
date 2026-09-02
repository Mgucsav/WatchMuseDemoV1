export const MAX_SOCIAL_POST_LENGTH = 1000;

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
