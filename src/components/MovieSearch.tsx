"use client";

import { useEffect, useState } from "react";

import { MovieResultList } from "@/components/MovieResultList";
import { ProviderPanel, type ProviderState } from "@/components/ProviderPanel";
import { StatusMessage } from "@/components/StatusMessage";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import {
  SEARCH_DEBOUNCE_MS,
  SEARCH_MAX_QUERY_LENGTH,
  SEARCH_MIN_QUERY_LENGTH,
} from "@/lib/constants";
import type {
  MovieProvidersResult,
  MovieSearchResult,
  MovieSummary,
} from "@/lib/tmdb/types";

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: MovieSearchResult }
  | { status: "error"; error: ApiError };

/**
 * Tamamlanan istekler, ait oldukları girdiyle birlikte saklanır.
 * Görüntülenen durum bu kayıttan türetildiği için, girdi değiştiği anda
 * eski sonuç kendiliğinden geçersiz olur ve ekranda kalamaz.
 */
type SearchOutcome = { query: string; state: SearchState };
type ProviderOutcome = { movieId: number; state: ProviderState };

export function MovieSearch() {
  const [query, setQuery] = useState("");
  const [searchOutcome, setSearchOutcome] = useState<SearchOutcome | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<MovieSummary | null>(null);
  const [providerOutcome, setProviderOutcome] =
    useState<ProviderOutcome | null>(null);

  const trimmedQuery = query.trim();
  const isQueryTooShort = trimmedQuery.length < SEARCH_MIN_QUERY_LENGTH;

  // Arama: en az iki karakter, debounce ve iptal edilebilir istek.
  useEffect(() => {
    if (isQueryTooShort) return;

    const controller = new AbortController();

    const timer = setTimeout(() => {
      fetchJson<MovieSearchResult>(
        `/api/movies/search?q=${encodeURIComponent(trimmedQuery)}`,
        controller.signal,
      )
        .then((data) =>
          setSearchOutcome({
            query: trimmedQuery,
            state: { status: "success", data },
          }),
        )
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setSearchOutcome({
            query: trimmedQuery,
            state: { status: "error", error: toApiError(error) },
          });
        });
    }, SEARCH_DEBOUNCE_MS);

    // Temizlik hem bekleyen debounce'u hem de uçuştaki isteği iptal eder;
    // böylece eski bir yanıt yeni sonuçların üzerine yazamaz.
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmedQuery, isQueryTooShort]);

  // Sağlayıcı sorgusu yalnızca bir film seçildiğinde çalışır.
  useEffect(() => {
    if (!selectedMovie) return;

    const { id: movieId } = selectedMovie;
    const controller = new AbortController();

    fetchJson<MovieProvidersResult>(
      `/api/movies/${movieId}/providers`,
      controller.signal,
    )
      .then((data) =>
        setProviderOutcome({ movieId, state: { status: "success", data } }),
      )
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setProviderOutcome({
          movieId,
          state: { status: "error", error: toApiError(error) },
        });
      });

    return () => controller.abort();
  }, [selectedMovie]);

  const searchState: SearchState = isQueryTooShort
    ? { status: "idle" }
    : searchOutcome?.query === trimmedQuery
      ? searchOutcome.state
      : { status: "loading" };

  const providerState: ProviderState | null = !selectedMovie
    ? null
    : providerOutcome?.movieId === selectedMovie.id
      ? providerOutcome.state
      : { status: "loading" };

  function handleQueryChange(value: string) {
    setQuery(value);
    // Arama değiştiğinde önceki seçimin sonucu artık geçerli değil.
    setSelectedMovie(null);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <header>
        <h1 className="text-xl font-bold">Film Abonelik Kontrolü</h1>
        <p className="mt-1 text-sm text-black/70 dark:text-white/70">
          Bir film arayın, afiş ve yayın yılından doğru filmi seçin; Netflix ve
          Amazon Prime Video&apos;nun Türkiye kataloğunda aboneliğe dahil olup
          olmadığını görün.
        </p>
      </header>

      <div>
        <label htmlFor="movie-search" className="block text-sm font-medium">
          Film adı
        </label>
        <input
          id="movie-search"
          type="search"
          autoComplete="off"
          maxLength={SEARCH_MAX_QUERY_LENGTH}
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder="Örn: Yüzüklerin Efendisi"
          className="mt-1 min-h-11 w-full rounded-lg border border-black/20 bg-transparent px-3 py-2 text-base outline-none focus:border-black/60 dark:border-white/25 dark:focus:border-white/70"
        />
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
          Arama en az {SEARCH_MIN_QUERY_LENGTH} karakterden sonra başlar.
        </p>
      </div>

      <SearchSection
        state={searchState}
        selectedMovieId={selectedMovie?.id ?? null}
        onSelect={setSelectedMovie}
      />

      {selectedMovie && providerState ? (
        <ProviderPanel movie={selectedMovie} state={providerState} />
      ) : null}

      <footer className="border-t border-black/10 pt-4 text-xs leading-relaxed text-black/50 dark:border-white/15 dark:text-white/50">
        <p>
          Film verileri{" "}
          <a
            href="https://www.themoviedb.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            TMDb
          </a>{" "}
          API&apos;si ile sağlanmaktadır. Bu ürün TMDb tarafından onaylanmamış
          veya sertifikalandırılmamıştır.
        </p>
        <p className="mt-1">
          Yayın platformu bilgileri TMDb aracılığıyla{" "}
          <a
            href="https://www.justwatch.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            JustWatch
          </a>{" "}
          kaynağından gelir ve platformlarla tamamen eşzamanlı olmayabilir.
        </p>
      </footer>
    </div>
  );
}

function SearchSection({
  state,
  selectedMovieId,
  onSelect,
}: {
  state: SearchState;
  selectedMovieId: number | null;
  onSelect: (movie: MovieSummary) => void;
}) {
  if (state.status === "idle") return null;

  if (state.status === "loading") {
    return (
      <p role="status" className="text-sm text-black/60 dark:text-white/60">
        Aranıyor…
      </p>
    );
  }

  if (state.status === "error") {
    // Yerel yapılandırma eksikliği ile TMDb'nin kimlik bilgisini reddetmesi
    // ayrı durumlardır ve ayrı yönlendirme gerektirir.
    const { code } = state.error;

    return (
      <StatusMessage tone="error" title={errorTitle(code)}>
        {state.error.message}
        {code === "not_configured" ? (
          <span className="mt-1 block">
            Proje kökünde <code>.env.local</code> dosyası oluşturup{" "}
            <code>TMDB_ACCESS_TOKEN</code> değerini ekleyin ve sunucuyu yeniden
            başlatın.
          </span>
        ) : null}
        {code === "auth_failed" ? (
          <span className="mt-1 block">
            Sunucudaki TMDb kimlik bilgisi tanımlı, ancak TMDb tarafından kabul
            edilmedi. Sunucu yapılandırmasının güncellenmesi gerekiyor.
          </span>
        ) : null}
      </StatusMessage>
    );
  }

  // Sonuç bulunamaması bir hata değildir; ayrı bir durum olarak gösterilir.
  if (state.data.results.length === 0) {
    return (
      <StatusMessage>
        “{state.data.query}” için TMDb üzerinde film bulunamadı. Farklı bir
        yazım deneyin.
      </StatusMessage>
    );
  }

  return (
    <MovieResultList
      movies={state.data.results}
      selectedMovieId={selectedMovieId}
      onSelect={onSelect}
    />
  );
}

function errorTitle(code: string): string {
  if (code === "not_configured") return "TMDb bağlantısı henüz yapılandırılmamış";
  if (code === "auth_failed") return "TMDb erişimi reddedildi";
  if (code === "rate_limited") return "Çok fazla istek gönderildi";
  if (code === "query_too_long") return "Arama çok uzun";
  return "Arama yapılamadı";
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError(
    "unexpected",
    "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.",
  );
}
