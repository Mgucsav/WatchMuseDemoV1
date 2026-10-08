import "server-only";

import { errorResponse } from "@/lib/api/responses";
import { normalizeSocialError, socialError, type SocialErrorCode } from "./errors";
import { SocialServiceError } from "./service";

const STATUS: Partial<Record<SocialErrorCode, number>> = {
  unauthenticated: 401,
  registration_required: 403,
  likes_private: 403,
  social_post_not_found: 404,
  invalid_parent_post: 404,
  profile_not_found: 404,
  social_post_rate_limited: 429,
  not_configured: 503,
};

/** Sosyal servis hatasını Türkçe mesajlı JSON hata yanıtına çevirir. */
export function socialErrorResponse(error: unknown): Response {
  const normalized =
    error instanceof SocialServiceError ? error.socialError : normalizeSocialError(error);
  return errorResponse(normalized.code, normalized.message, STATUS[normalized.code] ?? 400);
}

export function socialCodeResponse(code: SocialErrorCode): Response {
  const error = socialError(code);
  return errorResponse(error.code, error.message, STATUS[code] ?? 400);
}
