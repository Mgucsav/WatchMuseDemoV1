"use client";

import { useMemo, useState } from "react";

import { LibraryItemCard } from "@/components/library/LibraryItemCard";
import type { LibraryItem, LibraryStatus } from "@/lib/library/types";

const PAGE_SIZE = 20;

type Sort = "recent" | "title" | "rating";

const SORT_LABELS: Record<LibraryStatus, { value: Sort; label: string }[]> = {
  watchlist: [
    { value: "recent", label: "Son eklenen" },
    { value: "title", label: "Ada göre" },
  ],
  watched: [
    { value: "recent", label: "Son izlenen" },
    { value: "rating", label: "Puana göre" },
    { value: "title", label: "Ada göre" },
  ],
};

const collator = new Intl.Collator("tr-TR", { sensitivity: "base" });

function recentKey(item: LibraryItem): string {
  return item.status === "watched" ? (item.watchedAt ?? item.updatedAt) : item.createdAt;
}

/** Bir kütüphane sekmesinin listesi: arama, sıralama ve parça parça gösterim. */
export function LibraryList({
  items,
  status,
}: {
  items: LibraryItem[];
  status: LibraryStatus;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    const filtered = needle
      ? items.filter((item) => item.movieTitle.toLocaleLowerCase("tr-TR").includes(needle))
      : items;
    return [...filtered].sort((a, b) => {
      if (sort === "title") return collator.compare(a.movieTitle, b.movieTitle);
      if (sort === "rating") {
        const byRating = (b.rating ?? 0) - (a.rating ?? 0);
        if (byRating !== 0) return byRating;
      }
      return recentKey(b).localeCompare(recentKey(a));
    });
  }, [items, query, sort]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Kütüphanede ara</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisible(PAGE_SIZE);
            }}
            placeholder="Kütüphanede ara…"
            className="min-h-10 w-full rounded-lg border border-line-20 bg-transparent px-3 text-sm outline-none focus:border-line-focus"
          />
        </label>
        <div role="group" aria-label="Sıralama" className="flex flex-wrap gap-1">
          {SORT_LABELS[status].map((option) => {
            const selected = option.value === sort;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setSort(option.value)}
                className={`min-h-9 rounded-full border px-3 text-xs whitespace-nowrap transition-colors ${
                  selected
                    ? "border-brand-green bg-fill-hover font-semibold"
                    : "border-line-20 text-ink-70 hover:bg-fill-hover"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-20 p-5 text-center text-sm text-ink-60">
          “{query.trim()}” ile eşleşen film yok.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.slice(0, visible).map((item) => (
            <LibraryItemCard key={item.id} item={item} />
          ))}
        </ul>
      )}

      {shown.length > visible ? (
        <button
          type="button"
          onClick={() => setVisible((count) => count + PAGE_SIZE)}
          className="min-h-11 rounded-lg border border-line-20 text-sm hover:bg-fill-hover"
        >
          Daha fazla göster ({shown.length - visible} film daha)
        </button>
      ) : null}
    </div>
  );
}
