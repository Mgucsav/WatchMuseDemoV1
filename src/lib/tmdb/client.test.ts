import { describe, expect, it } from "vitest";

import { errorForStatus } from "./client";
import { TmdbError } from "./errors";

describe("errorForStatus", () => {
  it("401 ve 403'ü auth_failed olarak sınıflandırır", () => {
    for (const status of [401, 403]) {
      const error = errorForStatus(status);
      expect(error).toBeInstanceOf(TmdbError);
      expect(error.code).toBe("auth_failed");
      expect(error.httpStatus).toBe(502);
    }
  });

  it("auth_failed ile not_configured'ı ayırır", () => {
    // Yerel yapılandırma eksikliği ayrı bir koddur ve yalnızca token hiç
    // tanımlı değilken üretilir; upstream reddi onunla karışmamalıdır.
    expect(errorForStatus(401).code).not.toBe("not_configured");
  });

  it("404'ü not_found olarak sınıflandırır", () => {
    const error = errorForStatus(404);
    expect(error.code).toBe("not_found");
    expect(error.httpStatus).toBe(404);
  });

  it("429'u rate_limited olarak sınıflandırır", () => {
    const error = errorForStatus(429);
    expect(error.code).toBe("rate_limited");
    expect(error.httpStatus).toBe(429);
  });

  it("diğer hata kodlarını upstream olarak sınıflandırır", () => {
    for (const status of [400, 418, 500, 502, 503]) {
      expect(errorForStatus(status).code).toBe("upstream");
    }
    expect(errorForStatus(500).httpStatus).toBe(502);
  });

  it("mesajlarda kimlik bilgisi veya başlık sızdırmaz", () => {
    for (const status of [401, 403, 404, 429, 500]) {
      const { message } = errorForStatus(status);
      expect(message).not.toMatch(/Bearer/i);
      expect(message).not.toMatch(/eyJ/);
      expect(message).not.toMatch(/Authorization/i);
    }
  });

  it("upstream mesajında yalnızca durum kodunu paylaşır", () => {
    expect(errorForStatus(503).message).toContain("503");
  });
});

describe("TmdbError", () => {
  it("not_configured için 503 döner", () => {
    expect(new TmdbError("not_configured", "x").httpStatus).toBe(503);
  });

  it("timeout için 504 döner", () => {
    expect(new TmdbError("timeout", "x").httpStatus).toBe(504);
  });

  it("network ve invalid_response için 502 döner", () => {
    expect(new TmdbError("network", "x").httpStatus).toBe(502);
    expect(new TmdbError("invalid_response", "x").httpStatus).toBe(502);
  });
});
