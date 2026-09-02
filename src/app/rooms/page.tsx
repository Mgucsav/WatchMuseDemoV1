import Link from "next/link";

import { RoomsHub } from "@/components/rooms/RoomsHub";
import { getCurrentActor } from "@/lib/auth/dal";

export const metadata = { title: "WatchMuse — Odalar" };

export default async function RoomsPage() {
  const actor = await getCurrentActor();
  const isRegistered = Boolean(actor && !actor.isAnonymous);

  return (
    <main className="flex-1">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
        <RoomsHub isRegistered={isRegistered} />

        <footer className="border-t border-black/10 pt-4 text-xs text-black/50 dark:border-white/15 dark:text-white/50">
          <Link href="/" className="underline underline-offset-2">
            Film aramaya dön
          </Link>
        </footer>
      </div>
    </main>
  );
}
