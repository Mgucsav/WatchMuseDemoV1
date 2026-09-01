"use client";

import { StatusMessage } from "@/components/StatusMessage";
import type { ApiError } from "@/lib/api/fetch-json";
import type {
  MovieProvidersResult,
  ProviderAvailability,
  TargetProviderKey,
} from "@/lib/tmdb/types";

/**
 * Türkiye abonelik durumunun ortak sunumu.
 *
 * Hem sayfa içindeki `ProviderPanel` hem de `MovieDetailModal` bu bölümü
 * kullanır; sınıflandırma metinleri ve rozet renkleri tek yerde tanımlıdır.
 */

export type ProviderState =
  | { status: "loading" }
  | { status: "success"; data: MovieProvidersResult }
  | { status: "error"; error: ApiError };

/**
 * Marka renkleri yalnızca ayırt edici bir vurgu şeridi olarak kullanılıyor;
 * platform arayüzleri taklit edilmiyor.
 */
const ACCENT_BY_PROVIDER: Record<TargetProviderKey, string> = {
  netflix: "border-l-[#E50914]",
  prime_video: "border-l-[#00A8E1]",
  apple_tv_plus: "border-l-[#7D7D7D]",
  disney_plus: "border-l-[#113CCF]",
  blutv: "border-l-[#0F62FE]",
  mubi: "border-l-[#001489]",
};

type AvailabilityState = "available" | "unavailable" | "unknown";

const BADGE_BY_STATE: Record<
  AvailabilityState,
  { label: string; className: string }
> = {
  available: {
    label: "Aboneliğe dahil",
    className:
      "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  },
  unavailable: {
    label: "Bulunamadı",
    className:
      "bg-black/[0.06] text-black/70 dark:bg-white/10 dark:text-white/70",
  },
  unknown: {
    label: "Bilgi mevcut değil",
    className:
      "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  },
};

export function ProviderAvailabilitySection({ state }: { state: ProviderState }) {
  if (state.status === "loading") {
    return (
      <p className="text-sm text-black/60 dark:text-white/60">
        Türkiye abonelik bilgisi kontrol ediliyor…
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <StatusMessage tone="error" title="Sağlayıcı bilgisi alınamadı">
        {state.error.message}
      </StatusMessage>
    );
  }

  const { data } = state;

  // "Sonuç yok" bir hata değildir: TMDb'de Türkiye kaydı olabilir ama hiçbir
  // platform abonelikle sunmuyor olabilir. Bu durum ayrıca söylenir, aksi halde
  // iki gri "Bulunamadı" rozeti eksik veri izlenimi bırakır.
  const hasAnyFlatrate =
    data.providers.some((provider) => provider.available) ||
    data.otherFlatrateProviders.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {data.providers.map((provider) => (
          <ProviderRow
            key={provider.key}
            provider={provider}
            hasRegionData={data.hasRegionData}
          />
        ))}
      </ul>

      {!data.hasRegionData ? (
        <StatusMessage tone="warning">
          Türkiye için abonelik bilgisi bulunamadı. TMDb bu filmin Türkiye
          kataloğu hakkında veri sunmuyor.
        </StatusMessage>
      ) : null}

      {data.hasRegionData && !hasAnyFlatrate ? (
        <StatusMessage>
          Bu film şu anda Türkiye&apos;de hiçbir platformda aboneliğe dahil
          değil. Kiralama ve satın alma seçenekleri bu listede gösterilmez.
        </StatusMessage>
      ) : null}

      {data.otherFlatrateProviders.length > 0 ? (
        <p className="text-xs text-black/60 dark:text-white/60">
          Türkiye&apos;de abonelikle sunan diğer platformlar:{" "}
          {data.otherFlatrateProviders
            .map((provider) => provider.name)
            .join(", ")}
        </p>
      ) : null}

      <p className="text-xs text-black/50 dark:text-white/50">
        Son kontrol: {formatCheckedAt(data.checkedAt)}
      </p>

      {data.watchOptionsUrl ? (
        <a
          href={data.watchOptionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
        >
          TMDb&apos;de tüm izleme seçeneklerini gör
        </a>
      ) : null}
    </div>
  );
}

function ProviderRow({
  provider,
  hasRegionData,
}: {
  provider: ProviderAvailability;
  hasRegionData: boolean;
}) {
  const availabilityState: AvailabilityState = !hasRegionData
    ? "unknown"
    : provider.available
      ? "available"
      : "unavailable";

  const badge = BADGE_BY_STATE[availabilityState];

  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border border-l-4 border-black/10 px-3 py-2 dark:border-white/15 ${ACCENT_BY_PROVIDER[provider.key]}`}
    >
      <span className="text-sm font-medium">{provider.label}</span>
      <span
        className={`rounded-full px-2 py-1 text-xs font-semibold ${badge.className}`}
      >
        {badge.label}
      </span>
    </li>
  );
}

function formatCheckedAt(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;

  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
