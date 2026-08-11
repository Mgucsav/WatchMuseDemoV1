import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/AuthForm";
import { StatusMessage } from "@/components/StatusMessage";
import { signInAction } from "@/lib/auth/actions";
import { getCurrentActor, getCurrentUser } from "@/lib/auth/dal";
import { safeRedirectPath } from "@/lib/auth/redirects";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata = { title: "WatchMuse — Giriş yap" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; hata?: string }>;
}) {
  const params = await searchParams;
  const nextPath = safeRedirectPath(params.next);

  const user = await getCurrentUser();
  if (user) redirect(nextPath);
  const actor = await getCurrentActor();

  return (
    <main className="flex-1">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-8">
        <header>
          <h1 className="text-xl font-bold">Giriş yap</h1>
          <p className="mt-1 text-sm text-black/70 dark:text-white/70">
            Kişisel film kütüphanenize erişmek için giriş yapın.
          </p>
        </header>

        {!isSupabaseConfigured() ? (
          <StatusMessage tone="warning" title="Hesap servisi yapılandırılmamış">
            Sunucuda Supabase ayarları eksik. Film arama ve odalar çalışmaya
            devam eder; hesap ve kütüphane özellikleri için kurulum gerekir.
          </StatusMessage>
        ) : null}

        {params.hata === "baglanti" ? (
          <StatusMessage tone="error" title="Bağlantı geçersiz">
            Doğrulama bağlantısı geçersiz veya süresi dolmuş. Yeniden deneyin.
          </StatusMessage>
        ) : null}

        {params.hata === "yapilandirma" ? (
          <StatusMessage tone="error" title="Yapılandırma eksik">
            Hesap servisi şu anda kullanılamıyor.
          </StatusMessage>
        ) : null}

        {actor?.isAnonymous ? (
          <StatusMessage tone="warning" title="Bu cihazda geçici listeniz var">
            Mevcut hesabınıza giriş yapabilirsiniz; ancak bu cihazdaki geçici
            kayıtlar henüz hesaplar arasında birleştirilmez. Yeni bir hesap
            oluşturmak istiyorsanız önce puanlarınızı kaydedin.
          </StatusMessage>
        ) : null}

        <AuthForm
          action={signInAction}
          submitLabel="Giriş yap"
          mode="signIn"
          nextPath={nextPath}
        />

        <div className="flex flex-col gap-1 border-t border-black/10 pt-4 text-sm dark:border-white/15">
          <Link href="/hesabini-kaydet" className="underline underline-offset-4">
            Bu cihazdaki puanlarımı kaydet
          </Link>
          <Link href="/sifre-sifirla" className="underline underline-offset-4">
            Şifrenizi mi unuttunuz?
          </Link>
        </div>
      </div>
    </main>
  );
}
