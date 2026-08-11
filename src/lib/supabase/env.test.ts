import { describe, expect, it } from "vitest";

import {
  SUPABASE_ANON_KEY_ENV,
  SUPABASE_URL_ENV,
  shouldUseLocalRooms,
  validateSupabaseEnv,
} from "./env";

const VALID_URL = "https://abcdefghijklm.supabase.co";
const VALID_KEY = "sb_publishable_ABCdef123456789";

function source(overrides: Record<string, string | undefined> = {}) {
  return {
    [SUPABASE_URL_ENV]: VALID_URL,
    [SUPABASE_ANON_KEY_ENV]: VALID_KEY,
    ...overrides,
  };
}

describe("validateSupabaseEnv — geçerli yapılandırma", () => {
  it("doğru değerleri kabul eder", () => {
    const result = validateSupabaseEnv(source());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.env.url).toBe(VALID_URL);
      expect(result.env.anonKey).toBe(VALID_KEY);
    }
  });

  it("değerlerdeki baştaki/sondaki boşluğu kırpar", () => {
    const result = validateSupabaseEnv(
      source({
        [SUPABASE_URL_ENV]: `  ${VALID_URL}  `,
        [SUPABASE_ANON_KEY_ENV]: `  ${VALID_KEY}  `,
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.env.anonKey).toBe(VALID_KEY);
  });

  it("yerel geliştirmede http'ye izin verir", () => {
    expect(
      validateSupabaseEnv(
        source({ [SUPABASE_URL_ENV]: "http://localhost:54321" }),
      ).ok,
    ).toBe(true);

    expect(
      validateSupabaseEnv(
        source({ [SUPABASE_URL_ENV]: "http://127.0.0.1:54321" }),
      ).ok,
    ).toBe(true);
  });

  it("URL'i origin'e normalize eder", () => {
    const result = validateSupabaseEnv(
      source({ [SUPABASE_URL_ENV]: `${VALID_URL}/rest/v1/?x=1` }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.env.url).toBe(VALID_URL);
  });
});

describe("validateSupabaseEnv — eksik veya hatalı yapılandırma", () => {
  it("her iki değişken de eksikse ikisini de raporlar", () => {
    const result = validateSupabaseEnv({});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toEqual([SUPABASE_URL_ENV, SUPABASE_ANON_KEY_ENV]);
    }
  });

  it("boş dizeyi eksik sayar", () => {
    const result = validateSupabaseEnv(
      source({ [SUPABASE_ANON_KEY_ENV]: "   " }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toContain(SUPABASE_ANON_KEY_ENV);
  });

  it("geçersiz URL'i reddeder", () => {
    const result = validateSupabaseEnv(
      source({ [SUPABASE_URL_ENV]: "bir url degil" }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toContain(SUPABASE_URL_ENV);
  });

  it("uzak sunucuda http'yi reddeder", () => {
    const result = validateSupabaseEnv(
      source({ [SUPABASE_URL_ENV]: "http://abc.supabase.co" }),
    );

    expect(result.ok).toBe(false);
  });

  it("anahtarın içindeki boşluğu reddeder", () => {
    const result = validateSupabaseEnv(
      source({ [SUPABASE_ANON_KEY_ENV]: "abc def" }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toContain(SUPABASE_ANON_KEY_ENV);
  });
});

describe("validateSupabaseEnv — sızıntı önleme", () => {
  it("hata gerekçesinde anahtarın DEĞERİNİ göstermez", () => {
    const secretish = "sb_publishable_THIS_SHOULD_NOT_APPEAR";

    const result = validateSupabaseEnv(
      source({
        [SUPABASE_URL_ENV]: "gecersiz",
        [SUPABASE_ANON_KEY_ENV]: secretish,
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).not.toContain(secretish);
      // Yalnızca değişken ADI raporlanır.
      expect(result.reason).toContain(SUPABASE_URL_ENV);
    }
  });

  it("boşluk hatasında bile anahtar değerini sızdırmaz", () => {
    const secretish = "gizli deger";
    const result = validateSupabaseEnv(
      source({ [SUPABASE_ANON_KEY_ENV]: secretish }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).not.toContain(secretish);
  });
});

describe("shouldUseLocalRooms", () => {
  it("uses local rooms when Supabase is not configured", () => {
    expect(shouldUseLocalRooms({})).toBe(true);
  });

  it("uses Supabase rooms for a valid configuration", () => {
    expect(shouldUseLocalRooms(source())).toBe(false);
  });

  it("honors an explicit public local-mode flag", () => {
    expect(
      shouldUseLocalRooms({
        ...source(),
        NEXT_PUBLIC_USE_LOCAL_ROOMS: "true",
      }),
    ).toBe(true);
  });
});
