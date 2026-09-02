import { SocialFeed } from "@/components/social/SocialFeed";
import { getCurrentActor } from "@/lib/auth/dal";

export default async function Home() {
  const actor = await getCurrentActor();
  return (
    <main className="flex-1">
      <SocialFeed isRegistered={Boolean(actor && !actor.isAnonymous)} />
    </main>
  );
}
