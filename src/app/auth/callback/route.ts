import { NextResponse, type NextRequest } from "next/server";

import { safeRedirectPath } from "@/lib/auth/redirects";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /auth/callback
 *
 * E-posta doğrulama ve şifre sıfırlama bağlantılarının döndüğü uç.
 * Supabase tek kullanımlık bir `code` gönderir; burada oturuma çevrilir ve
 * oturum çerezleri yazılır (Route Handler bunu yapabilir, Server Component
 * yapamaz).
 *
 * GÜVENLİK: `next` parametresi doğrudan kullanılmaz. `safeRedirectPath` yalnızca
 * kendi sitemize ait göreli yollara izin verir; aksi halde açık yönlendirme
 * (open redirect) açığı oluşurdu.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams, origin } = request.nextUrl;

  const code = searchParams.get("code");
  const nextPath = safeRedirectPath(searchParams.get("next"));

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(
      new URL("/giris?hata=yapilandirma", origin),
    );
  }

  if (!code) {
    return NextResponse.redirect(new URL("/giris?hata=baglanti", origin));
  }

  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) {
    return NextResponse.redirect(
      new URL("/giris?hata=yapilandirma", origin),
    );
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Kodun neden geçersiz olduğu paylaşılmaz.
    return NextResponse.redirect(new URL("/giris?hata=baglanti", origin));
  }

  return NextResponse.redirect(new URL(nextPath, origin));
}
