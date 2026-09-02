import Link from "next/link";
import { Suspense } from "react";

import { UserMenu } from "@/components/auth/UserMenu";

/**
 * Üst menü.
 *
 * Kullanıcı alanı ayrı bir Server Component'te ve `<Suspense>` içinde:
 * layout'ta üst seviyede `await` yapmak ilk akan parçayı ve `{children}`
 * içeriğini oturum sorgusunun arkasında bekletirdi. Bu yapıda sayfa hemen
 * akar, kullanıcı menüsü hazır olunca yerine oturur.
 */
export function SiteHeader() {
  return (
    <header className="border-b border-black/10 dark:border-white/15">
      <nav
        aria-label="Ana gezinme"
        className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
      >
        <Link href="/" className="text-base font-bold tracking-tight">
          WatchMuse
        </Link>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Link href="/" className="underline-offset-4 hover:underline">
            Akış
          </Link>
          <Link href="/ara" className="underline-offset-4 hover:underline">
            Ara
          </Link>
          <Link href="/kutuphanem" className="underline-offset-4 hover:underline">
            Kütüphanem
          </Link>
          <Link href="/rooms" className="underline-offset-4 hover:underline">
            Odalar
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-3 text-sm">
          <Suspense fallback={<span className="text-black/40 dark:text-white/40">…</span>}>
            <UserMenu />
          </Suspense>
        </div>
      </nav>
    </header>
  );
}
