import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { readSupabaseEnv } from "@/lib/supabase/env";

/**
 * Supabase oturum tazeleme.
 *
 * Next.js 16'da `middleware` konvansiyonu `proxy` olarak yeniden adlandırıldı;
 * bu dosya o konvansiyonu kullanır (çalışma zamanı: nodejs).
 *
 * Server Component'ler çerez yazamaz. Anonim oturumun JWT'si süresi dolduğunda
 * yenilenmezse sunucu tarafı sorgular yetkisiz hale gelir. Bu proxy her
 * istekte token'ı tazeler ve güncellenmiş çerezleri yanıta yazar.
 *
 * Supabase yapılandırılmamışsa hiçbir şey yapmadan geçirir: mevcut TMDb
 * arama akışı Supabase olmadan da çalışmaya devam eder.
 */
export async function proxy(request: NextRequest) {
  const env = readSupabaseEnv();
  if (!env.ok) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.env.url, env.env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Token'ı doğrular ve gerekiyorsa tazeler. Sonuç kullanılmaz; yan etkisi
  // (çerez güncellemesi) için çağrılır. Kullanıcı bilgisi loglanmaz.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Statik varlıklar hariç tüm yollar. Negatif eşleşme olmadan proxy
     * CSS/JS/görsel isteklerinde de çalışır ve gereksiz yük oluşturur.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
