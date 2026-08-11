import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/AuthForm";
import { StatusMessage } from "@/components/StatusMessage";
import { signUpAction } from "@/lib/auth/actions";
import { getCurrentActor } from "@/lib/auth/dal";
import { safeRedirectPath } from "@/lib/auth/redirects";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata = { title: "WatchMuse — Kayıt ol" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = safeRedirectPath(params.next);

  const actor = await getCurrentActor();
  if (actor) {
    if (actor.isAnonymous) {
      redirect(`/hesabini-kaydet?next=${encodeURIComponent(nextPath)}`);
    }
    redirect(nextPath);
  }

  return (
    <main className="flex-1">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-8">
        <header>
          <h1 className="text-xl font-bold">Kayıt ol</h1>
          <p className="mt-1 text-sm text-black/70 dark:text-white/70">
            İzleyeceğiniz filmleri kaydedin, izlediklerinize puan ve not ekleyin.
          </p>
        </header>

        {!isSupabaseConfigured() ? (
          <StatusMessage tone="warning" title="Hesap servisi yapılandırılmamış">
            Sunucuda Supabase ayarları eksik. Film arama ve odalar çalışmaya
            devam eder; hesap ve kütüphane özellikleri için kurulum gerekir.
          </StatusMessage>
        ) : null}

        <AuthForm
          action={signUpAction}
          submitLabel="Hesap oluştur"
          mode="signUp"
          nextPath={nextPath}
        />

        <div className="border-t border-black/10 pt-4 text-sm dark:border-white/15">
          <Link href="/giris" className="underline underline-offset-4">
            Zaten hesabınız var mı? Giriş yapın
          </Link>
        </div>
      </div>
    </main>
  );
}
