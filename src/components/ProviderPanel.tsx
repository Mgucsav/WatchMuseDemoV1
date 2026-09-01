"use client";

import { LibraryActions } from "@/components/library/LibraryActions";
import { MoviePoster } from "@/components/MoviePoster";
import {
  ProviderAvailabilitySection,
  type ProviderState,
} from "@/components/ProviderAvailability";
import type { MovieSummary } from "@/lib/tmdb/types";

/**
 * Sayfa akışı içinde gösterilen sağlayıcı paneli.
 *
 * Arama sonucundan bir film seçildiğinde artık `MovieDetailModal` açılır; bu
 * panel, aynı bilgiyi modal olmadan sayfa içinde göstermek gereken yerler için
 * korunmuştur. Abonelik sunumu `ProviderAvailabilitySection` ile paylaşılır,
 * böylece iki yüzey arasında metin veya sınıflandırma farkı oluşamaz.
 */

export type { ProviderState };

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

      <div className="mt-4 border-t border-black/10 pt-4 dark:border-white/15">
        <LibraryActions movie={movie} />
      </div>

      <div className="mt-4">
        <ProviderAvailabilitySection state={state} />
      </div>
    </section>
  );
}
