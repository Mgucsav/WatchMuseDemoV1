import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/AuthForm";
import { Logo } from "@/components/brand/Logo";
import { StatusMessage } from "@/components/StatusMessage";
import { signInAction } from "@/lib/auth/actions";
import { getCurrentActor, getCurrentUser } from "@/lib/auth/dal";
import { safeRedirectPath } from "@/lib/auth/redirects";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata = { title: "WatchMuse — Giriş yap" };

const FEATURES = [
  { label: "Akış", text: "Filmler hakkında konuşun, yorumlara katılın." },
  { label: "Ara", text: "Bir filmin Türkiye’de hangi platformda olduğunu görün." },
  { label: "Kütüphanem", text: "Kişisel film kütüphanenizi tek yerde tutun." },
  { label: "Odalar", text: "Arkadaşlarınızla çarkla ya da oylamayla film seçin." },
];

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
    <main className="flex flex-1 flex-col lg:flex-row">
      <aside className="flex flex-col gap-8 border-b border-line-10 px-4 pt-5 pb-8 sm:px-8 lg:w-1/2 lg:justify-between lg:gap-14 lg:border-r lg:border-b-0 lg:px-16 lg:pt-10 lg:pb-12">
        <Link href="/" aria-label="WatchMuse tanıtım sayfası" className="self-start no-underline">
          <Logo size="md" />
        </Link>

        <div className="flex max-w-lg flex-col gap-8">
          <div>
            <p className="text-xs font-semibold tracking-wide text-brand-green uppercase">
              Film topluluğu
            </p>
            <h2 className="mt-3 font-display text-[40px] leading-[0.95] tracking-[0.02em] lg:text-[60px]">
              Filmleri birlikte <span className="text-brand-red">konuşalım</span>,
              birlikte <span className="text-brand-green">seçelim</span>.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-60 lg:mt-4 lg:text-base">
              Filmler hakkında paylaşım yapın, yorumlara katılın, birlikte film
              seçin ve kişisel film kütüphanenizi yönetin.
            </p>
          </div>

          <ul className="hidden border-b border-line-10 lg:block">
            {FEATURES.map((feature) => (
              <li
                key={feature.label}
                className="grid grid-cols-[7rem_minmax(0,1fr)] gap-4 border-t border-line-10 py-3.5 text-sm"
              >
                <span className="pt-0.5 text-xs font-semibold tracking-wide text-ink-50 uppercase">
                  {feature.label}
                </span>
                <span className="text-ink-70">{feature.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="hidden text-xs text-ink-50 lg:block">
          Film bilgileri ve afişler TMDb’den gelir.
        </p>
      </aside>

      <div className="flex flex-1 justify-center px-4 py-8 sm:px-8 lg:items-center lg:py-12">
        <div className="flex w-full max-w-md flex-col gap-5">
          <header>
            <h1 className="text-xl font-bold lg:text-2xl">Giriş yap</h1>
            <p className="mt-1 text-sm text-ink-60">
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

          <div className="flex flex-col gap-2 border-t border-line-10 pt-4 text-sm">
            <p className="text-ink-60">
              Hesabınız yok mu?{" "}
              <Link href="/kayit" className="font-medium underline underline-offset-4">
                Kayıt olun
              </Link>
            </p>
            <Link href="/sifre-sifirla" className="self-start underline underline-offset-4">
              Şifrenizi mi unuttunuz?
            </Link>
            <Link href="/hesabini-kaydet" className="self-start underline underline-offset-4">
              Bu cihazdaki puanlarımı kaydet
            </Link>
          </div>

          <p className="text-xs text-ink-50 lg:hidden">
            Film bilgileri ve afişler TMDb’den gelir.
          </p>
        </div>
      </div>
    </main>
  );
}
