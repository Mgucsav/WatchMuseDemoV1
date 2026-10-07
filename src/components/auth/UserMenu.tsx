import Link from "next/link";

import { signOutAction } from "@/lib/auth/actions";
import { getCurrentActor } from "@/lib/auth/dal";

/**
 * Sol panelin hesap bölümü.
 *
 * Server Component'tir: oturum kontrolü sunucuda yapılır ve istemciye yalnızca
 * gösterilecek ad gider — e-posta, token veya oturum nesnesi gönderilmez.
 */
export async function UserMenu() {
  const actor = await getCurrentActor();

  if (!actor || actor.isAnonymous) {
    return (
      <>
        <Link href="/giris" className="underline-offset-4 lg:px-3">
          Giriş yap
        </Link>
        <Link
          href="/hesabini-kaydet"
          className="rounded-lg border border-line-20 px-3 py-1.5 text-center no-underline hover:bg-fill-hover"
        >
          Hesabımı kaydet
        </Link>
      </>
    );
  }

  const label = actor.displayName ?? actor.email ?? "Hesabım";

  return (
    <>
      <Link
        href="/hesabim"
        className="flex max-w-[14rem] items-center gap-2.5 text-wm-foreground no-underline lg:max-w-none lg:px-1"
        title={label}
      >
        {actor.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={actor.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
        ) : (
          <span
            aria-hidden="true"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fill-placeholder text-xs font-bold"
          >
            {label.charAt(0).toLocaleUpperCase("tr-TR")}
          </span>
        )}
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{label}</span>
          <span className="hidden text-xs text-ink-55 lg:block">Profili düzenle</span>
        </span>
      </Link>
      <form action={signOutAction}>
        <button
          type="submit"
          className="w-full rounded-lg border border-line-20 px-3 py-1.5 hover:bg-fill-hover"
        >
          Çıkış yap
        </button>
      </form>
    </>
  );
}
