import Link from "next/link";

import { RoomCreator } from "@/components/rooms/RoomCreator";

export const metadata = {
  title: "WatchMuse — Oda oluştur",
};

export default function RoomsPage() {
  return (
    <main className="flex-1">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
        <header>
          <h1 className="text-xl font-bold">Oda oluştur</h1>
          <p className="mt-1 text-sm text-black/70 dark:text-white/70">
            İki kişilik özel bir oda açın ve davet bağlantısını birlikte film
            seçeceğiniz kişiye gönderin. Odaya en fazla iki kişi katılabilir.
          </p>
        </header>

        <RoomCreator />

        <footer className="border-t border-black/10 pt-4 text-xs text-black/50 dark:border-white/15 dark:text-white/50">
          <Link href="/" className="underline underline-offset-2">
            Film aramaya dön
          </Link>
        </footer>
      </div>
    </main>
  );
}
