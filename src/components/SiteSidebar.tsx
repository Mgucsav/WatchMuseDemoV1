import Link from "next/link";
import { Suspense } from "react";

import { SiteNav } from "@/components/SiteNav";
import { UserMenu } from "@/components/auth/UserMenu";
import { Logo } from "@/components/brand/Logo";

/**
 * Sol panel: logo, bölümler ve hesap alanı.
 *
 * Geniş ekranda sayfanın solunda sabit durur; telefonda üstte yatay bir
 * çubuğa dönüşür. Kullanıcı alanı ayrı bir Server Component'te ve
 * `<Suspense>` içinde: layout'ta üst seviyede `await` yapmak ilk akan parçayı
 * ve `{children}` içeriğini oturum sorgusunun arkasında bekletirdi. Bu yapıda
 * sayfa hemen akar, kullanıcı alanı hazır olunca yerine oturur.
 */
export function SiteSidebar() {
  return (
    <aside className="border-b border-line-10 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-r lg:border-b-0">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 lg:h-full lg:flex-col lg:flex-nowrap lg:items-stretch lg:gap-8 lg:px-4 lg:py-6">
        <Link href="/" aria-label="WatchMuse tanıtım sayfası" className="self-center no-underline lg:self-start lg:px-3">
          <Logo />
        </Link>

        <SiteNav />

        <div className="ml-auto flex flex-wrap items-center gap-3 text-sm lg:mt-auto lg:ml-0 lg:flex-col lg:items-stretch lg:border-t lg:border-line-10 lg:pt-4">
          <Suspense fallback={<span className="text-ink-40">…</span>}>
            <UserMenu />
          </Suspense>
        </div>
      </div>
    </aside>
  );
}
