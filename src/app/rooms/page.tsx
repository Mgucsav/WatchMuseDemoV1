import Link from "next/link";

import { RoomCreator } from "@/components/rooms/RoomCreator";
import { PublicRoomBrowser } from "@/components/rooms/PublicRoomBrowser";
import { getCurrentActor } from "@/lib/auth/dal";

export const metadata = {
  title: "WatchMuse — Oda oluştur",
};

export default async function RoomsPage() {
  const actor = await getCurrentActor();
  const isRegistered = Boolean(actor && !actor.isAnonymous);

  return (
    <main className="flex-1">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
        <header>
          <h1 className="text-xl font-bold">Film karar odaları</h1>
          <p className="mt-1 text-sm text-black/70 dark:text-white/70">
            Private veya public bir oda kurun, kişi sınırını belirleyin ve
            birlikte film arayıp oylayın. Çark sistemi aynı şekilde devam eder.
          </p>
        </header>

        <RoomCreator canCreatePublic={isRegistered} />
        <PublicRoomBrowser canJoinPublic={isRegistered} />

        <footer className="border-t border-black/10 pt-4 text-xs text-black/50 dark:border-white/15 dark:text-white/50">
          <Link href="/" className="underline underline-offset-2">
            Film aramaya dön
          </Link>
        </footer>
      </div>
    </main>
  );
}
