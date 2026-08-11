import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { requireSupabaseEnv } from "./env";

/**
 * Sunucu tarafı Supabase istemcisi (Route Handler / Server Component).
 *
 * Kullanıcının çerezdeki oturumuyla çalışır; yani sorgular çağıran kullanıcının
 * `auth.uid()` kimliğiyle ve RLS altında yürütülür. `service_role` anahtarı
 * KULLANILMAZ — RLS'i atlayacak bir yol bilinçli olarak bırakılmamıştır.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const env = requireSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component bağlamında çerez yazılamaz. Oturum tazeleme
          // `src/proxy.ts` tarafından yapıldığı için bu durum güvenlidir.
        }
      },
    },
  });
}

export async function getLocalRoomUserIdFromServerCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("watchmuse_local_user_id");
  return cookie?.value ?? null;
}

/**
 * Doğrulanmış kullanıcı kimliğini döndürür.
 *
 * `getUser()` kullanılır — `getSession()` çerezdeki JWT'ye güvenir ve
 * sunucu tarafında sahtelenebilir; `getUser()` token'ı Supabase Auth'a
 * doğrulatır.
 */
export async function getAuthenticatedUserId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}
