import Link from "next/link";

import { AuthForm } from "@/components/auth/AuthForm";
import { StatusMessage } from "@/components/StatusMessage";
import {
  requestPasswordResetAction,
  updatePasswordAction,
} from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/dal";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata = { title: "WatchMuse — Şifre sıfırlama" };

/**
 * Tek sayfa, iki durum:
 *
 *  - Oturum YOK  → e-posta iste, sıfırlama bağlantısı gönder.
 *  - Oturum VAR  → kullanıcı bağlantıdan geldi (callback oturumu kurdu),
 *                  yeni şifreyi sor.
 */
export default async function ResetPasswordPage() {
  const user = await getCurrentUser();
  const configured = isSupabaseConfigured();

  return (
    <main className="flex-1">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-8">
        <header>
          <h1 className="text-xl font-bold">
            {user ? "Yeni şifre belirle" : "Şifre sıfırlama"}
          </h1>
          <p className="mt-1 text-sm text-black/70 dark:text-white/70">
            {user
              ? "Hesabınız için yeni bir şifre belirleyin."
              : "E-posta adresinizi girin; sıfırlama bağlantısı gönderelim."}
          </p>
        </header>

        {!configured ? (
          <StatusMessage tone="warning" title="Hesap servisi yapılandırılmamış">
            Sunucuda Supabase ayarları eksik.
          </StatusMessage>
        ) : null}

        {user ? (
          <AuthForm
            action={updatePasswordAction}
            submitLabel="Şifreyi güncelle"
            mode="updatePassword"
          />
        ) : (
          <AuthForm
            action={requestPasswordResetAction}
            submitLabel="Sıfırlama bağlantısı gönder"
            mode="requestReset"
          />
        )}

        <div className="border-t border-black/10 pt-4 text-sm dark:border-white/15">
          <Link href="/giris" className="underline underline-offset-4">
            Giriş ekranına dön
          </Link>
        </div>
      </div>
    </main>
  );
}
