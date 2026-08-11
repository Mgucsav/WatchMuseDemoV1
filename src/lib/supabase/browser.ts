"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseEnv, isLocalRoomsEnabled } from "./env";

/**
 * Tarayıcı Supabase istemcisi.
 *
 * Yalnızca anon (publishable) anahtarı kullanır. Bu anahtar gizli değildir ve
 * tek başına yetki vermez; erişimi Row Level Security belirler.
 * `service_role` anahtarı bu projede hiçbir yerde kullanılmaz.
 *
 * İstemci tembel oluşturulur: Supabase yapılandırılmamışsa modül import
 * edilmek uygulamayı çökertmez, yalnızca bu fonksiyon çağrıldığında hata verir.
 */

let cached: SupabaseClient | null = null;
let anonymousSessionInFlight: Promise<AnonymousSessionResult> | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (cached) return cached;

  const env = requireSupabaseEnv();
  cached = createBrowserClient(env.url, env.anonKey);

  return cached;
}

export interface AnonymousSessionResult {
  id: string;
  /** Bu çağrının yeni bir anonim oturum oluşturup oluşturmadığı. */
  created: boolean;
}

/**
 * Supabase yapılandırılmışsa tarayıcıda bir kimlik olmasını sağlar.
 *
 * Oda akışındaki yerel geliştirme geri dönüşünden ayrı tutulur: kişisel
 * kütüphane verisi yalnızca gerçek Supabase `auth.uid()` kimliğiyle kalıcıdır.
 */
export async function ensureSupabaseAnonymousSession(): Promise<AnonymousSessionResult> {
  // Ana sayfa kimlik önyüklemesi ile davet sayfası aynı anda çalışabilir. İki
  // ayrı `signInAnonymously()` çağrısı iki farklı user_id yaratır ve davet
  // akışını yarış koşuluna sokar. Aynı tarayıcı bağlamında tek isteği paylaş.
  if (anonymousSessionInFlight) return anonymousSessionInFlight;

  anonymousSessionInFlight = (async () => {
    const supabase = getSupabaseBrowserClient();

    const { data: existing } = await supabase.auth.getSession();
    if (existing.session?.user?.id) {
      return { id: existing.session.user.id, created: false };
    }

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user?.id) {
      throw new Error("Anonim oturum başlatılamadı.");
    }

    return { id: data.user.id, created: true };
  })();

  try {
    return await anonymousSessionInFlight;
  } finally {
    anonymousSessionInFlight = null;
  }
}

/**
 * Anonim oturum önyüklemesi.
 *
 * Oturum yoksa anonim kullanıcı oluşturur. Anonim kimlik, kullanıcıdan hiçbir
 * kayıt bilgisi istemeden kalıcı ve doğrulanabilir bir `auth.uid()` sağlar;
 * RLS politikalarının tamamı bu kimliğe dayanır.
 *
 * Dönen değer yalnızca kullanıcı kimliğidir; token veya oturum nesnesi
 * çağırana verilmez.
 */
function getLocalUserIdFromCookie(): string | null {
  if (typeof document === "undefined") return null;

  const match = document.cookie.match(/(?:^|;)\s*watchmuse_local_user_id=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function setLocalUserIdCookie(id: string) {
  if (typeof document === "undefined") return;
  const cookie = `watchmuse_local_user_id=${encodeURIComponent(id)}; path=/; samesite=lax`;
  document.cookie = cookie;
}

export async function ensureAnonymousSession(): Promise<string> {
  if (isLocalRoomsEnabled()) {
    let localId = getLocalUserIdFromCookie();
    if (localId) return localId;

    localId = `local-${Math.random().toString(36).slice(2, 10)}`;
    setLocalUserIdCookie(localId);
    return localId;
  }

  const session = await ensureSupabaseAnonymousSession();
  return session.id;
}
