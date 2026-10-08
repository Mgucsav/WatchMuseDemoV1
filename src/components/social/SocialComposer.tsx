"use client";

import { useEffect, useState } from "react";

import { MoviePoster } from "@/components/MoviePoster";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import {
  SEARCH_DEBOUNCE_MS,
  SEARCH_MIN_QUERY_LENGTH,
} from "@/lib/constants";
import { MAX_SOCIAL_POST_LENGTH } from "@/lib/social/validation";
import type { MovieSearchResult, MovieSummary } from "@/lib/tmdb/types";

/** Yeni gönderi ya da (compact) cevap formu. */
export function SocialComposer({
  parentPostId = null,
  compact = false,
  onCreated,
}: {
  parentPostId?: string | null;
  compact?: boolean;
  onCreated: () => void | Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [movieQuery, setMovieQuery] = useState("");
  const [movieResults, setMovieResults] = useState<MovieSummary[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<MovieSummary | null>(null);
  const [searchingMovies, setSearchingMovies] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmedMovieQuery = movieQuery.trim();

  useEffect(() => {
    if (compact || selectedMovie || trimmedMovieQuery.length < SEARCH_MIN_QUERY_LENGTH) {
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchJson<MovieSearchResult>(
        `/api/movies/search?q=${encodeURIComponent(trimmedMovieQuery)}`,
        controller.signal,
      )
        .then((result) => {
          setMovieResults(result.results.slice(0, 5));
          setSearchingMovies(false);
        })
        .catch((caught: unknown) => {
          if (controller.signal.aborted) return;
          setError(caught instanceof ApiError ? caught.message : "Film aranamadı.");
          setSearchingMovies(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [compact, selectedMovie, trimmedMovieQuery]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await fetchJson<{ postId: string }>("/api/feed", undefined, {
        method: "POST",
        body: {
          body,
          parentPostId,
          movie: selectedMovie
            ? {
                id: selectedMovie.id,
                title: selectedMovie.title,
                posterPath: selectedMovie.posterPath,
              }
            : null,
        },
      });
      setBody("");
      setMovieQuery("");
      setMovieResults([]);
      setSelectedMovie(null);
      await onCreated();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Gönderi paylaşılamadı.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className={compact ? "grid gap-2" : "grid gap-3 rounded-xl border border-line-15 p-4"}
    >
      {!compact ? <h2 className="font-semibold">Bir film konuşması başlat</h2> : null}
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={MAX_SOCIAL_POST_LENGTH}
        rows={compact ? 2 : 3}
        placeholder={compact ? "Bu yoruma cevap ver…" : "Bir film hakkında ne düşünüyorsun?"}
        className="w-full resize-y rounded-lg border border-line-20 bg-transparent px-3 py-2 text-sm outline-none"
      />

      {!compact ? (
        <div className="grid gap-2">
          {selectedMovie ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-line-10 p-2">
              <div className="flex min-w-0 items-center gap-3">
                <MoviePoster movie={selectedMovie} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{selectedMovie.title}</p>
                  <p className="text-xs text-ink-55">Gönderiye eklendi</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedMovie(null);
                  setMovieQuery("");
                  setMovieResults([]);
                }}
                className="min-h-9 px-2 text-xs underline"
              >
                Kaldır
              </button>
            </div>
          ) : (
            <label className="text-xs font-medium">
              Film ekle <span className="font-normal text-ink-50">(isteğe bağlı)</span>
              <input
                type="search"
                value={movieQuery}
                onChange={(event) => {
                  const value = event.target.value;
                  setMovieQuery(value);
                  setMovieResults([]);
                  setSearchingMovies(value.trim().length >= SEARCH_MIN_QUERY_LENGTH);
                }}
                placeholder="Film adı ara…"
                className="mt-1 min-h-10 w-full rounded-lg border border-line-20 bg-transparent px-3 text-sm"
              />
            </label>
          )}

          {!selectedMovie && searchingMovies ? (
            <p className="text-xs text-ink-50">Film aranıyor…</p>
          ) : null}

          {!selectedMovie && movieResults.length > 0 ? (
            <div className="grid gap-1 rounded-lg border border-line-10 p-2">
              {movieResults.map((movie) => (
                <button
                  key={movie.id}
                  type="button"
                  onClick={() => {
                    setSelectedMovie(movie);
                    setMovieResults([]);
                    setSearchingMovies(false);
                  }}
                  className="flex items-center gap-3 rounded-md p-2 text-left hover:bg-fill-hover"
                >
                  <MoviePoster movie={movie} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{movie.title}</span>
                    <span className="text-xs text-ink-50">
                      {movie.releaseYear ?? "Yıl bilinmiyor"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-ink-45">
          {body.length}/{MAX_SOCIAL_POST_LENGTH}
        </span>
        <button
          type="submit"
          disabled={sending || body.trim() === ""}
          className="min-h-10 rounded-lg bg-fill-inverse px-4 text-sm font-semibold text-on-inverse disabled:opacity-50"
        >
          {sending ? "Paylaşılıyor…" : compact ? "Cevapla" : "Paylaş"}
        </button>
      </div>
      {error ? <p className="text-sm text-error-ink">{error}</p> : null}
    </form>
  );
}
