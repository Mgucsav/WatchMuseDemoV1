"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { StatusMessage } from "@/components/StatusMessage";
import { PostList } from "@/components/social/PostList";
import { SocialComposer } from "@/components/social/SocialComposer";
import type { FeedScope, FeedSort } from "@/lib/social/types";
import { normalizeFeedSort } from "@/lib/social/validation";

const SCOPES: { value: FeedScope; label: string }[] = [
  { value: "all", label: "Genel" },
  { value: "following", label: "Takip ettiklerin" },
];

const SORTS: { value: FeedSort; label: string; hint: string }[] = [
  { value: "hot", label: "Hot", hint: "Etkileşim ve yeniliğe göre" },
  { value: "top", label: "Popüler", hint: "Son 30 günün en çok etkileşim alanları" },
  { value: "new", label: "Yeni", hint: "En yeni paylaşımlar önce" },
];

const EMPTY_TEXT: Record<FeedScope, string> = {
  all: "Akış henüz boş. İlk film sohbetini başlatabilirsiniz.",
  following: "Takip ettiğin hesaplar henüz bir şey paylaşmadı. Profillerden yeni hesaplar takip edebilirsin.",
};

export function SocialFeed({ isRegistered }: { isRegistered: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Adres çubuğunda Türkçe: ?kapsam=takip&sirala=top|new (varsayılan: Genel, Hot).
  const scope: FeedScope = searchParams.get("kapsam") === "takip" ? "following" : "all";
  const sort = normalizeFeedSort(searchParams.get("sirala")) ?? "hot";
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  function choose(next: { scope?: FeedScope; sort?: FeedSort }) {
    const params = new URLSearchParams(searchParams.toString());
    const nextScope = next.scope ?? scope;
    const nextSort = next.sort ?? sort;
    if (nextScope === "following") params.set("kapsam", "takip");
    else params.delete("kapsam");
    if (nextSort === "hot") params.delete("sirala");
    else params.set("sirala", nextSort);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const showFollowingSignup = scope === "following" && !isRegistered;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <header>
        <h1 className="text-xl font-bold">WatchMuse Akış</h1>
        <p className="mt-1 text-sm text-ink-70">
          Filmler hakkında konuşun, yorumlara katılın ve yeni fikirler keşfedin.
        </p>
      </header>

      {isRegistered ? (
        <SocialComposer onCreated={() => setRefreshKey((key) => key + 1)} />
      ) : (
        <StatusMessage tone="warning" title="Akışı okuyabilirsiniz">
          Paylaşım, cevap, beğeni, repost ve takip için{" "}
          <Link href="/hesabini-kaydet?next=/akis" className="font-semibold underline">
            anonim hesabınızı kaydedin
          </Link>{" "}
          veya <Link href="/giris?next=/akis" className="font-semibold underline">giriş yapın</Link>.
        </StatusMessage>
      )}

      {notice ? (
        <StatusMessage tone="warning" title="Üyelik gerekli">
          {notice}{" "}
          <Link href="/hesabini-kaydet?next=/akis" className="font-semibold underline">
            Hesabımı kaydet
          </Link>
        </StatusMessage>
      ) : null}

      <div className="flex flex-col gap-3">
        <div role="tablist" aria-label="Akış" className="flex border-b border-line-10">
          {SCOPES.map((item) => {
            const selected = item.value === scope;
            return (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => choose({ scope: item.value })}
                className={`-mb-px min-h-11 flex-1 border-b-2 px-3 text-sm transition-colors hover:bg-fill-hover ${
                  selected ? "border-brand-green font-semibold" : "border-transparent text-ink-60"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="group" aria-label="Sıralama" className="flex flex-wrap gap-1">
            {SORTS.map((item) => {
              const selected = item.value === sort;
              return (
                <button
                  key={item.value}
                  type="button"
                  title={item.hint}
                  aria-pressed={selected}
                  onClick={() => choose({ sort: item.value })}
                  className={`min-h-9 rounded-full border px-4 text-sm transition-colors ${
                    selected
                      ? "border-brand-green bg-fill-hover font-semibold"
                      : "border-line-20 text-ink-70 hover:bg-fill-hover"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((key) => key + 1)}
            className="min-h-9 rounded-lg border border-line-20 px-3 text-sm hover:bg-fill-hover"
          >
            Yenile
          </button>
        </div>
      </div>

      {showFollowingSignup ? (
        <p className="rounded-xl border border-dashed border-line-20 p-5 text-center text-sm text-ink-60">
          Hesapları takip etmek ve onların paylaşımlarını burada görmek için{" "}
          <Link href="/hesabini-kaydet?next=/akis" className="underline">
            hesabınızı kaydedin
          </Link>
          .
        </p>
      ) : (
        <PostList
          source={`/api/feed?scope=${scope}&sort=${sort}`}
          isRegistered={isRegistered}
          emptyText={EMPTY_TEXT[scope]}
          refreshKey={refreshKey}
          onMembershipNeeded={setNotice}
        />
      )}
    </div>
  );
}
