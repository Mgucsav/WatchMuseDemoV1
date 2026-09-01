import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { readSupabaseEnv } from "./env";

/**
 * Yönetimsel (service-role) Supabase istemcisi — YALNIZCA SUNUCU.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NEDEN VAR (RR-02)
 *
 * Aday planını kalıcılaştıran RPC hiçbir istemci rolüne açık değildir. Eğer
 * `authenticated` rolüne açık olsaydı, bir oda üyesi Supabase Data API üzerinden
 * doğrudan çağırıp kendi aday listesini, seed'ini, policy/ranker sürümünü ve
 * `p_allow_eligible_repeats` kapısını dayatabilirdi. Bu, aday kaynağını,
 * tekrar sınırını ve gelecekteki ranker'ı baypas etmek demekti.
 *
 * Bu modül o RPC'yi çağırabilen tek kimliği taşır.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * GÜVENLİK KURALLARI
 *
 * 1. `import "server-only"` — bu modül bir istemci bileşeninden import edilirse
 *    **derleme kırılır**. Anahtar hiçbir koşulda tarayıcı paketine giremez.
 * 2. Değişken adı `SUPABASE_SERVICE_ROLE_KEY`'dir ve `NEXT_PUBLIC_` öneki
 *    **ASLA** almaz. Öneki eklemek anahtarı istemciye yayar.
 * 3. Anahtar değeri hiçbir yerde loglanmaz, hata mesajına konmaz ve döndürülmez.
 * 4. Bu istemci RLS'i atlar; bu yüzden **yalnızca** güvenilen tek bir işlem için
 *    kullanılır: doğrulanmış bir aktör adına tur adaylarını kalıcılaştırmak.
 *    Kullanıcı verisi okumak/yazmak için kullanılmaz — o yollar kullanıcının
 *    kendi oturumuyla ve RLS altında çalışmaya devam eder.
 * 5. Oturum kalıcılığı kapalıdır: bu istemci hiçbir kullanıcı oturumu taşımaz.
 */

export const SUPABASE_SERVICE_ROLE_KEY_ENV = "SUPABASE_SERVICE_ROLE_KEY";

export class SupabaseAdminNotConfiguredError extends Error {
  readonly code = "not_configured" as const;

  constructor() {
    // Mesaj yalnızca değişken ADINI içerir; değerinden hiçbir parça geçmez.
    super(
      `Güvenilen sunucu kimliği yapılandırılmamış. Sunucuda ${SUPABASE_SERVICE_ROLE_KEY_ENV} tanımlı değil.`,
    );
    this.name = "SupabaseAdminNotConfiguredError";
  }
}

function readServiceRoleKey(): string | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return key && key !== "" ? key : null;
}

/**
 * Yönetimsel istemcinin kullanılabilir olup olmadığını söyler.
 * Değeri açığa çıkarmaz; yalnızca varlık bilgisi döner.
 */
export function isSupabaseAdminConfigured(): boolean {
  return readSupabaseEnv().ok && readServiceRoleKey() !== null;
}

/**
 * Yönetimsel istemciyi üretir.
 *
 * Tembel çağrılır: modül import edilmek uygulamayı çökertmez. Yapılandırma
 * eksikse `SupabaseAdminNotConfiguredError` fırlatır ve çağıran taraf bunu
 * `not_configured` domain hatasına çevirir. Böylece film arama, kütüphane ve
 * oda okuma yolları bu anahtar olmadan da çalışmaya devam eder.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  const env = readSupabaseEnv();
  const serviceRoleKey = readServiceRoleKey();

  if (!env.ok || serviceRoleKey === null) {
    throw new SupabaseAdminNotConfiguredError();
  }

  return createClient(env.env.url, serviceRoleKey, {
    auth: {
      // Bu istemci hiçbir kullanıcı oturumu taşımaz ve yenilemez.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
