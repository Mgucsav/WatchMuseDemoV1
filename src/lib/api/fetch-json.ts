import type { ApiErrorBody } from "@/lib/tmdb/types";

/**
 * Arayüzün kendi API uçlarını çağırırken kullandığı ince sarmalayıcı.
 * Hata gövdesini `ApiError`e çevirir, böylece bileşenler tek bir tip üzerinden
 * kullanıcıya Türkçe mesaj gösterebilir.
 */

export class ApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

const GENERIC_ERROR_MESSAGE =
  "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.";

export async function fetchJson<T>(
  url: string,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, { signal });
  } catch (error) {
    // İstek bilinçli olarak iptal edildiyse çağıran taraf sessizce yok sayar.
    if (signal?.aborted) throw error;

    throw new ApiError(
      "network",
      "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.",
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError("invalid_response", GENERIC_ERROR_MESSAGE);
  }

  if (!response.ok) {
    const parsed = parseErrorBody(payload);
    throw new ApiError(parsed.code, parsed.message);
  }

  return payload as T;
}

function parseErrorBody(payload: unknown): ApiErrorBody["error"] {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof (payload as ApiErrorBody).error === "object" &&
    (payload as ApiErrorBody).error !== null
  ) {
    const { code, message } = (payload as ApiErrorBody).error;

    return {
      code: typeof code === "string" && code !== "" ? code : "unexpected",
      message:
        typeof message === "string" && message.trim() !== ""
          ? message
          : GENERIC_ERROR_MESSAGE,
    };
  }

  return { code: "unexpected", message: GENERIC_ERROR_MESSAGE };
}
