import Link from "next/link";

import { signOutAction } from "@/lib/auth/actions";
import { getCurrentActor } from "@/lib/auth/dal";

/**
 * Üst menünün kullanıcı bölümü.
 *
 * Server Component'tir: oturum kontrolü sunucuda yapılır ve istemciye yalnızca
 * gösterilecek ad gider — e-posta, token veya oturum nesnesi gönderilmez.
 */
export async function UserMenu() {
  const actor = await getCurrentActor();

  if (!actor || actor.isAnonymous) {
    return (
      <>
        <Link href="/giris" className="underline-offset-4 hover:underline">
          Giriş yap
        </Link>
        <Link
          href="/hesabini-kaydet"
          className="rounded-lg border border-black/20 px-3 py-1.5 hover:bg-black/[0.04] dark:border-white/25 dark:hover:bg-white/10"
        >
          Hesabımı kaydet
        </Link>
      </>
    );
  }

  const label = actor.displayName ?? actor.email ?? "Hesabım";

  return (
    <>
      <Link href="/hesabim" className="flex max-w-[12rem] items-center gap-2 truncate underline-offset-4 hover:underline" title={label}>
        {actor.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={actor.avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
        ) : null}
        <span className="truncate">{label}</span>
      </Link>
      <form action={signOutAction}>
        <button
          type="submit"
          className="rounded-lg border border-black/20 px-3 py-1.5 hover:bg-black/[0.04] dark:border-white/25 dark:hover:bg-white/10"
        >
          Çıkış yap
        </button>
      </form>
    </>
  );
}
