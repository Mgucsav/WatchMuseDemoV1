import Link from "next/link";

import { LibraryItemCard } from "@/components/library/LibraryItemCard";
import { StatusMessage } from "@/components/StatusMessage";
import { getCurrentActor } from "@/lib/auth/dal";
import { shouldPromptToSaveAccount } from "@/lib/auth/progressive";
import { getLibrary } from "@/lib/library/service";
import type { LibraryItem } from "@/lib/library/types";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata = { title: "WatchMuse — Kütüphanem" };
export const dynamic = "force-dynamic";

export default async function LibraryPage() {
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
            className="inline-flex min-h-11 items-center rounded-lg border border-black/20 px-4 py-2 text-sm font-medium hover:bg-black/[0.04] dark:border-white/25 dark:hover:bg-white/10"
          >
            Giriş yap
          </Link>
        </div>
      </Shell>
    );
  }

  const library = await getLibrary();
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

      <Section
        title="İzlenecekler"
        emptyText="Henüz izlenecek film eklemediniz. Arama ekranından film seçip “İzleneceklere ekle” diyebilirsiniz."
        items={library.watchlist}
      />

      <Section
        title="İzlediklerim"
        emptyText="Henüz izlediğiniz bir film işaretlemediniz."
        items={library.watched}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
        <header>
          <h1 className="text-xl font-bold">Kütüphanem</h1>
          <p className="mt-1 text-sm text-black/70 dark:text-white/70">
            İzleyeceğiniz filmleri kaydedin; izlediklerinize puan ve not ekleyin.
          </p>
        </header>

        {children}
      </div>
    </main>
  );
}

function Section({
  title,
  emptyText,
  items,
}: {
  title: string;
  emptyText: string;
  items: LibraryItem[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-black/50 uppercase dark:text-white/50">
        {title} ({items.length})
      </h2>

      {items.length === 0 ? (
        <StatusMessage>{emptyText}</StatusMessage>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <LibraryItemCard key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}
