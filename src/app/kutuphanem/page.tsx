import Link from "next/link";

import { LibraryList } from "@/components/library/LibraryList";
import { StatusMessage } from "@/components/StatusMessage";
import { getCurrentActor } from "@/lib/auth/dal";
import { shouldPromptToSaveAccount } from "@/lib/auth/progressive";
import { getLibrary } from "@/lib/library/service";
import type { LibraryStatus } from "@/lib/library/types";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata = { title: "WatchMuse — Kütüphanem" };
export const dynamic = "force-dynamic";

/** `?liste=izlendi` İzlediklerim sekmesini açar; varsayılan İzlenecekler. */
export default async function LibraryPage({ searchParams }: PageProps<"/kutuphanem">) {
  const status: LibraryStatus =
    (await searchParams).liste === "izlendi" ? "watched" : "watchlist";

  // Yapılandırma yoksa uygulama çökmez; açıklayıcı bir mesaj gösterilir.
  if (!isSupabaseConfigured()) {
    return (
      <Shell>
        <StatusMessage tone="warning" title="Hesap servisi yapılandırılmamış">
          Kişisel kütüphane için Supabase kurulumu gerekiyor. Film arama ve oda
          akışı bu ayar olmadan da çalışmaya devam eder.
        </StatusMessage>
      </Shell>
    );
  }

  const actor = await getCurrentActor();

  if (!actor) {
    return (
      <Shell>
        <StatusMessage title="Kişisel alanınız hazırlanıyor">
          Filmleri kaydetmek için hesap açmanız gerekmez. Tarayıcınızda güvenli
          bir ziyaretçi kimliği hazırlanıyor; bu işlem birkaç saniye sürebilir.
        </StatusMessage>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/giris?next=%2Fkutuphanem"
            className="inline-flex min-h-11 items-center rounded-lg border border-line-20 px-4 py-2 text-sm font-medium hover:bg-fill-hover"
          >
            Giriş yap
          </Link>
        </div>
      </Shell>
    );
  }

  const library = await getLibrary();
  const items = library[status];
  const itemCount = library.watchlist.length + library.watched.length;
  const showSavePrompt =
    actor.isAnonymous && shouldPromptToSaveAccount(itemCount);

  return (
    <Shell>
      {showSavePrompt ? (
        <StatusMessage title="Puanlarınızı kalıcı kaydedin">
          Bu cihazda {itemCount} film kaydınız var. E-posta ekleyerek listenize
          başka cihazlardan da erişebilirsiniz. Mevcut kayıtlarınız aynen kalır.
          <Link
            href="/hesabini-kaydet?next=%2Fkutuphanem"
            className="ml-1 font-medium underline underline-offset-4"
          >
            Hesabımı kaydet
          </Link>
        </StatusMessage>
      ) : null}

      {!actor.isAnonymous && !actor.emailConfirmed ? (
        <StatusMessage tone="warning" title="E-posta doğrulanmadı">
          Gelen kutunuzdaki doğrulama bağlantısına tıklayın. Bazı özellikler
          doğrulama tamamlanana kadar sınırlı olabilir.
        </StatusMessage>
      ) : null}

      <nav aria-label="Kütüphane listeleri" className="flex border-b border-line-10">
        {TABS.map((tab) => {
          const selected = tab.status === status;
          return (
            <Link
              key={tab.status}
              href={tab.href}
              aria-current={selected ? "page" : undefined}
              className={`-mb-px flex min-h-11 flex-1 items-center justify-center gap-2 border-b-2 px-3 text-sm no-underline transition-colors hover:bg-fill-hover ${
                selected
                  ? "border-brand-green font-semibold text-wm-foreground"
                  : "border-transparent text-ink-60"
              }`}
            >
              {tab.label}
              <span className="rounded-full bg-fill-badge px-2 py-0.5 text-xs text-ink-70">
                {library[tab.status].length}
              </span>
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <StatusMessage>{TABS.find((tab) => tab.status === status)!.emptyText}</StatusMessage>
      ) : (
        // key: sekme değişince arama ve sıralama sıfırlanır.
        <LibraryList key={status} items={items} status={status} />
      )}
    </Shell>
  );
}

const TABS: { status: LibraryStatus; label: string; href: string; emptyText: string }[] = [
  {
    status: "watchlist",
    label: "İzlenecekler",
    href: "/kutuphanem",
    emptyText:
      "Henüz izlenecek film eklemediniz. Arama ekranından film seçip “İzleneceklere ekle” diyebilirsiniz.",
  },
  {
    status: "watched",
    label: "İzlediklerim",
    href: "/kutuphanem?liste=izlendi",
    emptyText: "Henüz izlediğiniz bir film işaretlemediniz.",
  },
];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
        <header>
          <h1 className="text-xl font-bold">Kütüphanem</h1>
          <p className="mt-1 text-sm text-ink-70">
            İzleyeceğiniz filmleri kaydedin; izlediklerinize puan ve not ekleyin.
          </p>
        </header>

        {children}
      </div>
    </main>
  );
}
