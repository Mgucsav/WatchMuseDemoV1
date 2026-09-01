import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SUPABASE_SERVICE_ROLE_KEY_ENV,
  SupabaseAdminNotConfiguredError,
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "./admin";

/**
 * RR-02 güven sınırı testleri.
 *
 * Bu testler yönetimsel istemcinin **istemci paketine giremeyeceğini** ve
 * yapılandırma eksikken uygulamayı çökertmek yerine tanımlı bir hata
 * ürettiğini sabitler. Gerçek bir service-role anahtarı KULLANILMAZ; testler
 * yalnızca sahte, açıkça sahte bir değerle çalışır.
 */

const adminSource = readFileSync(
  fileURLToPath(new URL("./admin.ts", import.meta.url)),
  "utf8",
);

const FAKE_KEY = "test-not-a-real-service-role-key";
const FAKE_URL = "https://project-ref.supabase.co";

let originalKey: string | undefined;
let originalUrl: string | undefined;
let originalAnon: string | undefined;

beforeEach(() => {
  originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  originalAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

afterEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnon;
});

describe("yönetimsel istemci — server-only sınırı", () => {
  it("server-only koruması modülün ilk satırındadır", () => {
    // İstemci bileşeninden import edilirse Next.js derlemeyi kırar.
    expect(adminSource.trimStart().startsWith('import "server-only";')).toBe(true);
  });

  it("service-role anahtarı NEXT_PUBLIC_ öneki ile OKUNMAZ", () => {
    // Öneki eklemek anahtarı tarayıcı paketine yayardı.
    expect(adminSource).not.toMatch(/NEXT_PUBLIC_[A-Z_]*SERVICE_ROLE/);
    expect(adminSource).toContain("process.env.SUPABASE_SERVICE_ROLE_KEY");
    expect(SUPABASE_SERVICE_ROLE_KEY_ENV).toBe("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("anahtar değeri loglanmaz veya dışarı verilmez", () => {
    expect(adminSource).not.toMatch(/console\./);
    // Anahtarı döndüren bir yardımcı dışarı açılmaz.
    expect(adminSource).not.toMatch(/export function readServiceRoleKey/);
    expect(adminSource).not.toMatch(/export .*serviceRoleKey/);
  });

  it("oturum kalıcılığı kapalıdır: kullanıcı oturumu taşımaz", () => {
    expect(adminSource).toContain("persistSession: false");
    expect(adminSource).toContain("autoRefreshToken: false");
  });
});

describe("yönetimsel istemci — yapılandırma davranışı", () => {
  it("anahtar yokken tanımlı hata fırlatır, çökmez", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = FAKE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";

    expect(isSupabaseAdminConfigured()).toBe(false);
    expect(() => createSupabaseAdminClient()).toThrow(
      SupabaseAdminNotConfiguredError,
    );
  });

  it("hata mesajı yalnızca değişken ADINI içerir, değeri değil", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    try {
      createSupabaseAdminClient();
      throw new Error("hata bekleniyordu");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain(SUPABASE_SERVICE_ROLE_KEY_ENV);
      expect(message).not.toContain(FAKE_KEY);
    }
  });

  it("Supabase URL yokken de yapılandırılmamış sayılır", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    expect(isSupabaseAdminConfigured()).toBe(false);
  });

  it("tam yapılandırmada istemci üretilir", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = FAKE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";

    expect(isSupabaseAdminConfigured()).toBe(true);
    expect(createSupabaseAdminClient()).toBeTruthy();
  });
});

describe("yönetimsel istemci — kullanım kapsamı", () => {
  it("yalnızca oda servisi tarafından kullanılır", () => {
    // Yönetimsel istemcinin yayılması, RLS'i atlayan yolların çoğalması
    // demektir. Bu test kapsamı dar tutar.
    const roomService = readFileSync(
      fileURLToPath(new URL("../rooms/round-service.ts", import.meta.url)),
      "utf8",
    );

    expect(roomService).toContain("createSupabaseAdminClient");
    // Kullanıcı verisi okuyan yollar kendi oturumuyla ve RLS altında kalır.
    const libraryService = readFileSync(
      fileURLToPath(new URL("../library/service.ts", import.meta.url)),
      "utf8",
    );
    expect(libraryService).not.toContain("createSupabaseAdminClient");
    expect(libraryService).not.toContain("SERVICE_ROLE");
  });

  it("güvenilen kalıcılaştırma önce üyeliği kanıtlar", () => {
    const roomService = readFileSync(
      fileURLToPath(new URL("../rooms/round-service.ts", import.meta.url)),
      "utf8",
    );

    // Sıra: kullanıcı oturumuyla üyelik kanıtı → sonra service-role RPC.
    const memberIdx = roomService.indexOf("await requireSpaceMember(spaceId)");
    const adminIdx = roomService.indexOf("createSupabaseAdminClient()");

    expect(memberIdx).toBeGreaterThan(-1);
    expect(adminIdx).toBeGreaterThan(-1);
    expect(memberIdx).toBeLessThan(adminIdx);

    // Aktör kimliği RPC'ye açıkça geçilir.
    expect(roomService).toContain("p_actor_id: actorId");
  });
});
