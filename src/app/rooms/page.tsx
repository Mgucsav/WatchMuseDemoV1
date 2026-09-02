import Link from "next/link";

import { RoomCreator } from "@/components/rooms/RoomCreator";
import { PublicRoomBrowser } from "@/components/rooms/PublicRoomBrowser";
import { getCurrentActor } from "@/lib/auth/dal";

export const metadata = {
  title: "WatchMuse — Public odalar",
};

export default async function RoomsPage() {
  const actor = await getCurrentActor();
  const isRegistered = Boolean(actor && !actor.isAnonymous);

  return (
    <main className="flex-1">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
        <header>
          <h1 className="text-xl font-bold">Public odalar</h1>
          <p className="mt-1 text-sm text-black/70 dark:text-white/70">
            Açık odalara bağlantı aramadan katılın ve birlikte film seçin.
          </p>
        </header>

        <PublicRoomBrowser canJoinPublic={isRegistered} />

        <details className="group rounded-xl border border-black/10 dark:border-white/15">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <span>Yeni oda oluştur</span>
            <span aria-hidden="true" className="text-lg transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <div className="border-t border-black/10 p-4 dark:border-white/15">
            <p className="mb-4 text-sm text-black/65 dark:text-white/65">
              Private veya public oda kurun, kişi sınırını belirleyin ve çarkla
              birlikte film seçin.
            </p>
            <RoomCreator canCreatePublic={isRegistered} />
          </div>
        </details>

        <footer className="border-t border-black/10 pt-4 text-xs text-black/50 dark:border-white/15 dark:text-white/50">
          <Link href="/" className="underline underline-offset-2">
            Film aramaya dön
          </Link>
        </footer>
      </div>
    </main>
  );
}
