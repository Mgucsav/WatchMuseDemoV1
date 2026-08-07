"use client";

import { MoviePoster } from "@/components/MoviePoster";
import { StatusMessage } from "@/components/StatusMessage";
import type { ApiError } from "@/lib/api/fetch-json";
import type {
  MovieProvidersResult,
  MovieSummary,
  ProviderAvailability,
  TargetProviderKey,
} from "@/lib/tmdb/types";

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
    className: "bg-black/[0.06] text-black/70 dark:bg-white/10 dark:text-white/70",
  },
  unknown: {
    label: "Bilgi mevcut değil",
    className:
      "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  },
};

export function ProviderPanel({
  movie,
  state,
}: {
  movie: MovieSummary;
  state: ProviderState;
}) {
  return (
    <section
      aria-live="polite"
      className="rounded-xl border border-black/10 p-3 dark:border-white/15"
    >
      <h2 className="text-xs font-semibold tracking-wide text-black/50 uppercase dark:text-white/50">
        Seçilen film
      </h2>

      <div className="mt-2 flex items-start gap-3">
        <MoviePoster movie={movie} size="lg" />

        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold break-words">{movie.title}</p>
          <p className="mt-0.5 text-sm text-black/60 dark:text-white/60">
            {movie.releaseYear ?? "Yıl bilgisi yok"}
          </p>
          {movie.overview ? (
            <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-black/70 dark:text-white/70">
              {movie.overview}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4">{renderBody(state)}</div>
    </section>
  );
}

function renderBody(state: ProviderState) {
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

      {data.otherFlatrateProviders.length > 0 ? (
        <p className="text-xs text-black/60 dark:text-white/60">
          Türkiye&apos;de abonelikle sunan diğer platformlar:{" "}
          {data.otherFlatrateProviders.map((provider) => provider.name).join(", ")}
        </p>
      ) : null}

      <p className="text-xs text-black/50 dark:text-white/50">
        Son kontrol: {formatCheckedAt(data.checkedAt)}
      </p>

      {data.justWatchUrl ? (
        <a
          href={data.justWatchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
        >
          JustWatch üzerinde tüm izleme seçeneklerini gör
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
