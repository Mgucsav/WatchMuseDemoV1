import "server-only";

import { cache } from "react";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Data Access Layer — oturum doğrulamasının TEK noktası.
 *
 * `React.cache` ile sarmalanmıştır: aynı render geçişinde kaç kez çağrılırsa
 * çağrılsın Supabase Auth'a yalnızca bir istek gider. Böylece hem üst menüde
 * hem sayfada güvenle çağrılabilir.
 *
 * `getUser()` kullanılır, `getSession()` DEĞİL: `getSession()` çerezdeki JWT'ye
 * güvenir ve sunucu tarafında sahtelenebilir; `getUser()` token'ı Supabase
 * Auth'a doğrulatır.
 *
 * Anonim kullanıcı gerçek bir `auth.uid()` taşır. Bu nedenle odaya ve kişisel
 * kütüphaneye erişebilir; yalnızca başka cihazdan geri dönülebilen kalıcı bir
 * hesap sayılmaz. İki ayrım `getCurrentActor()` ve `getCurrentUser()` ile
 * açıkça temsil edilir.
 */

/**
 * Uygulamanın o anki veri sahibi.
 *
 * Anonim Supabase kullanıcıları da gerçek bir `auth.uid()` taşıdığı için oda ve
 * kişisel kütüphane verisinin sahibidir. Tek fark, tarayıcı verisi silinirse
 * aynı kimliğe başka cihazdan dönülememesidir.
 */
export interface CurrentActor {
  id: string;
  isAnonymous: boolean;
  email: string | null;
  displayName: string | null;
  emailConfirmed: boolean;
}

/**
 * Geçerli Supabase kimliğini döndürür; anonim kullanıcıları da kapsar.
 *
 * Kütüphane ve odalar bununla yetkilendirilir. Bir UI alanının yalnızca
 * taşınabilir/kalıcı hesabı göstermesi gerekiyorsa `getCurrentUser()` kullanılır.
 */
export const getCurrentActor = cache(async (): Promise<CurrentActor | null> => {
  // Supabase yapılandırılmamışsa uygulama çökmemeli; yalnızca "giriş yok".
  if (!isSupabaseConfigured()) return null;

  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const user = data.user;

  // Profil adı ayrı tabloda; RLS gereği yalnızca kendi satırı okunabilir.
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const displayName =
    typeof profile?.display_name === "string" && profile.display_name.trim() !== ""
      ? profile.display_name.trim()
      : null;

  return {
    id: user.id,
    isAnonymous: user.is_anonymous === true,
    email: user.email ?? null,
    displayName,
    emailConfirmed: Boolean(user.email_confirmed_at),
  };
});

/**
 * Yalnızca e-posta ile bağlanmış, başka cihazdan da erişilebilen hesaplar.
 *
 * Üst menü, çıkış ve şifre sıfırlama gibi "hesap" odaklı UI alanları anonim
 * oturumu hesap gibi göstermemelidir. Buna karşılık veri işlemleri
 * `getCurrentActor()` kullanarak anonim kullanıcıya da izin verir.
 */
export const getCurrentUser = cache(async (): Promise<CurrentActor | null> => {
  const actor = await getCurrentActor();
  return actor?.isAnonymous ? null : actor;
});

/**
 * Korumalı veri erişimi için: giriş yoksa hata fırlatır.
 *
 * Yetkilendirme kontrolü veri kaynağına en yakın yerde yapılmalıdır; bu yüzden
 * kütüphane servisi her işlemde bunu çağırır. Layout'ta yapılan bir kontrol
 * navigasyonlarda yeniden çalışmayabileceği için tek başına yeterli değildir.
 */
export async function requireCurrentActor(): Promise<CurrentActor> {
  const actor = await getCurrentActor();
  if (!actor) {
    throw new AuthRequiredError();
  }
  return actor;
}

export class AuthRequiredError extends Error {
  readonly code = "auth_required" as const;

  constructor() {
    super("Bu işlem için giriş yapmanız gerekiyor.");
    this.name = "AuthRequiredError";
  }
}
