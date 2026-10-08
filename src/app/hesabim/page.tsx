import { redirect } from "next/navigation";

import { AccountCenter, type AccountTab } from "@/components/account/AccountCenter";
import { getCurrentActor } from "@/lib/auth/dal";

export const metadata = { title: "WatchMuse — Hesabım" };
export const dynamic = "force-dynamic";

/** `?sekme=duzenle|arkadaslar|mesajlar` ile belirli sekme açılır. */
const TABS: Record<string, AccountTab> = {
  duzenle: "edit",
  arkadaslar: "people",
  mesajlar: "messages",
};

export default async function AccountPage({ searchParams }: PageProps<"/hesabim">) {
  const actor = await getCurrentActor();
  if (!actor || actor.isAnonymous) redirect("/hesabini-kaydet?next=/hesabim");
  const sekme = (await searchParams).sekme;
  const initialTab = (typeof sekme === "string" && TABS[sekme]) || "profile";

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <AccountCenter initialTab={initialTab} />
      </div>
    </main>
  );
}
