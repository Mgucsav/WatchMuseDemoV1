"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { ensureSupabaseAnonymousSession } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Ziyaretçiyi kayıt formuna göndermeden Supabase kimliğiyle başlatır.
 *
 * Supabase oturumu tarayıcı çerezinde tutulur. Yeni bir anonim oturum
 * oluşturulduğunda `router.refresh()` ile sonraki Server Component isteği o
 * çerezi görür; böylece kütüphane işlemleri ilk tıklamada da sahibinin
 * `auth.uid()` kimliğiyle çalışır.
 */
export function AnonymousSessionBootstrap() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    // Davet bileşeni kimliği kendi başlatır ve başarılı olunca odaya gider.
    // Burada yapılacak `router.refresh()` o yönlendirmeyle yarışabilir.
    if (pathname.startsWith("/invite/")) return;

    let cancelled = false;

    void ensureSupabaseAnonymousSession()
      .then((session) => {
        if (!cancelled && session.created) router.refresh();
      })
      .catch(() => {
        // Kayıt gerektirmeyen film arama ve oda ekranları çalışmaya devam eder.
        // Hata, kimlik gerektiren aksiyonda kullanıcıya açıkça gösterilir.
      });

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return null;
}
