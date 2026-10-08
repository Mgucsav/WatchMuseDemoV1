import { Suspense } from "react";

import { SocialFeed } from "@/components/social/SocialFeed";
import { getCurrentActor } from "@/lib/auth/dal";

export const metadata = { title: "WatchMuse — Akış" };

export default async function FeedPage() {
  const actor = await getCurrentActor();
  return (
    <main className="flex-1">
      {/* SocialFeed seçili sekmeyi adres çubuğundan (useSearchParams) okur. */}
      <Suspense>
        <SocialFeed isRegistered={Boolean(actor && !actor.isAnonymous)} />
      </Suspense>
    </main>
  );
}
