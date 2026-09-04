import { errorResponse } from "@/lib/api/responses";
import { AccountServiceError, normalizeAccountError } from "./errors";

export function accountErrorResponse(error: unknown): Response {
  const normalized = error instanceof AccountServiceError ? error : normalizeAccountError(error);
  const status =
    normalized.code === "unauthenticated" ? 401
      : normalized.code === "registration_required" || normalized.code === "direct_message_forbidden" ? 403
        : normalized.code === "user_not_found" || normalized.code === "friendship_not_found" ? 404
          : normalized.code === "username_taken" || normalized.code === "friendship_exists" ? 409
            : normalized.code === "direct_message_rate_limited" ? 429
              : normalized.code === "not_configured" ? 503
                : normalized.code === "unexpected" ? 500
                  : 400;
  return errorResponse(normalized.code, normalized.message, status);
}
