import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileView } from "@/components/profile/ProfileView";
import { getCurrentActor } from "@/lib/auth/dal";
import { normalizeProfileUsername } from "@/lib/social/validation";

export async function generateMetadata({
  params,
}: PageProps<"/u/[username]">): Promise<Metadata> {
  const username = normalizeProfileUsername((await params).username);
  return { title: username ? `@${username} — WatchMuse` : "WatchMuse" };
}

/** Herkese açık profil sayfası. Profil verisi istemcide, oturum hazır olunca yüklenir. */
export default async function ProfilePage({ params }: PageProps<"/u/[username]">) {
  const username = normalizeProfileUsername((await params).username);
  if (!username) notFound();
  const actor = await getCurrentActor();

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-2xl px-4 py-6">
        <ProfileView username={username} isRegistered={Boolean(actor && !actor.isAnonymous)} />
      </div>
    </main>
  );
}
