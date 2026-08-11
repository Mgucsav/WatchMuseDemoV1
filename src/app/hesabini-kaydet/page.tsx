import Link from "next/link";
import { redirect } from "next/navigation";

import { AccountSaveForm } from "@/components/auth/AccountSaveForm";
import { AuthForm } from "@/components/auth/AuthForm";
import { StatusMessage } from "@/components/StatusMessage";
import {
  finishAccountSaveAction,
  startAccountSaveAction,
} from "@/lib/auth/actions";
import { getCurrentActor } from "@/lib/auth/dal";
import { safeRedirectPath } from "@/lib/auth/redirects";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata = { title: "WatchMuse — Puanlarını kaydet" };
export const dynamic = "force-dynamic";

export default async function SaveAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; adim?: string }>;
}) {
  const params = await searchParams;
  const nextPath = safeRedirectPath(params.next);
  const isPasswordStep = params.adim === "sifre";
  const configured = isSupabaseConfigured();
  const actor = await getCurrentActor();

  // E-posta doğrulamasından dönen kalıcı kullanıcı burada şifresini belirler.
  if (actor && !actor.isAnonymous && !isPasswordStep) {
    redirect(nextPath);
  }

  return (
    <main className="flex-1">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-8">
        <header>
          <h1 className="text-xl font-bold">
            {isPasswordStep ? "Şifrenizi belirleyin" : "Puanlarınızı kaydedin"}
          </h1>
          <p className="mt-1 text-sm text-black/70 dark:text-white/70">
            {isPasswordStep
              ? "Son adım: bu hesabı başka cihazlardan açabilmeniz için bir şifre belirleyin."
              : "E-posta eklediğinizde bu cihazdaki listeniz ve puanlarınız aynen korunur."}
          </p>
        </header>

        {!configured ? (
          <StatusMessage tone="warning" title="Hesap servisi yapılandırılmamış">
            Sunucuda Supabase ayarları eksik. Film arama ve odalar çalışmaya
            devam eder; kişisel verileri kaydetmek için kurulum gerekir.
          </StatusMessage>
        ) : null}

        {!actor ? (
          <StatusMessage title="Kişisel alanınız hazırlanıyor">
            Hesap açmadan da liste oluşturabilirsiniz. Ziyaretçi kimliğiniz
            hazırlanırken birkaç saniye bekleyip sayfayı yenileyin.
          </StatusMessage>
        ) : isPasswordStep ? (
          <AuthForm
            action={finishAccountSaveAction}
            submitLabel="Hesabımı tamamla"
            mode="updatePassword"
            nextPath={nextPath}
          />
        ) : actor.isAnonymous ? (
          <AccountSaveForm action={startAccountSaveAction} nextPath={nextPath} />
        ) : null}

        <div className="flex flex-col gap-1 border-t border-black/10 pt-4 text-sm dark:border-white/15">
          <Link href="/kutuphanem" className="underline underline-offset-4">
            Kütüphaneme dön
          </Link>
          <Link href={`/giris?next=${encodeURIComponent(nextPath)}`} className="underline underline-offset-4">
            Zaten hesabım var, giriş yapacağım
          </Link>
        </div>
      </div>
    </main>
  );
}
