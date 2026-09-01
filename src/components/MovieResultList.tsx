"use client";

import { MoviePoster } from "@/components/MoviePoster";
import type { MovieSummary } from "@/lib/tmdb/types";

/**
 * Arama sonuçları. Kullanıcı afiş ve yayın yılı üzerinden doğru filmi seçer.
 *
 * Seçim, detay modalını açar; sağlayıcı ve künye sorgusu burada değil, yalnızca
 * modal açıldığında tetiklenir. Satırın kendisi tek etkileşimli öğedir: içinde
 * iç içe düğme veya bağlantı bulunmaz.
 */
export function MovieResultList({
  movies,
  selectedMovieId,
  onSelect,
}: {
  movies: MovieSummary[];
  /** Detay modalı açık olan filmin TMDb kimliği. */
  selectedMovieId: number | null;
  onSelect: (movie: MovieSummary) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {movies.map((movie) => {
        const isSelected = movie.id === selectedMovieId;

        return (
          <li key={movie.id}>
            <button
              type="button"
              onClick={() => onSelect(movie)}
              aria-haspopup="dialog"
              aria-expanded={isSelected}
              className={`flex w-full min-h-11 items-start gap-3 rounded-lg border p-2 text-left transition-colors ${
                isSelected
                  ? "border-black/40 bg-black/[0.04] dark:border-white/50 dark:bg-white/10"
                  : "border-black/10 hover:bg-black/[0.03] dark:border-white/15 dark:hover:bg-white/5"
              }`}
            >
              <MoviePoster movie={movie} />

              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold break-words">
                  {movie.title}
                </span>

                <span className="mt-0.5 block text-xs text-black/60 dark:text-white/60">
                  {movie.releaseYear ?? "Yıl bilgisi yok"}
                  {movie.voteAverage !== null
                    ? ` · TMDb ${movie.voteAverage.toFixed(1)}`
                    : ""}
                </span>

                {movie.originalTitle ? (
                  <span className="mt-0.5 block text-xs break-words text-black/50 dark:text-white/50">
                    {movie.originalTitle}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
