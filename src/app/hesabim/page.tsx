import { redirect } from "next/navigation";

import { AccountCenter } from "@/components/account/AccountCenter";
import { getCurrentActor } from "@/lib/auth/dal";

export const metadata = { title: "WatchMuse — Hesabım" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const actor = await getCurrentActor();
  if (!actor || actor.isAnonymous) redirect("/hesabini-kaydet?next=/hesabim");
  return <main className="flex-1"><div className="mx-auto w-full max-w-3xl px-4 py-6"><header className="mb-5"><h1 className="text-2xl font-bold">Hesabım</h1><p className="mt-1 text-sm text-black/65 dark:text-white/65">Profilinizi kişiselleştirin, arkadaşlarınızı yönetin ve özel mesajlaşın.</p></header><AccountCenter /></div></main>;
}
