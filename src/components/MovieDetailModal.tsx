"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { LibraryActions } from "@/components/library/LibraryActions";
import {
  ProviderAvailabilitySection,
  type ProviderState,
} from "@/components/ProviderAvailability";
import { StatusMessage } from "@/components/StatusMessage";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import type {
  MovieDetails,
  MovieDetailsResult,
  MovieSummary,
} from "@/lib/tmdb/types";
import {
  FOCUSABLE_SELECTOR,
  formatRuntime,
  lockBodyScroll,
  resolveFocusTrapTarget,
  shouldCloseOnBackdropClick,
  stateForMovie,
} from "@/lib/ui/modal";

/**
 * Film detay modalı.
 *
 * Arama sonucundan bir film seçildiğinde açılır ve künye, yönetmen, özet ile
 * Türkiye abonelik durumunu tek yerde gösterir.
 *
 * Kimlik her zaman TMDb ID'sidir (`movie.id`). Aynı adı taşıyan farklı TMDb
 * kayıtları bu yüzden birbirine karışmaz; başlık hiçbir yerde eşleştirme
 * ölçütü olarak kullanılmaz.
 *
 * Davranış kuralları `@/lib/ui/modal` içindeki saf fonksiyonlarda tanımlıdır
 * ve orada doğrudan test edilir.
 */

type DetailState =
  | { status: "loading" }
  | { status: "success"; data: MovieDetailsResult }
  | { status: "error"; error: ApiError };

const LOADING_STATE: DetailState = { status: "loading" };

export function MovieDetailModal({
  movie,
  onClose,
}: {
  /** Arama sonucundaki özet. Detay yüklenene kadar iskelet yerine gerçek veri gösterilir. */
  movie: MovieSummary;
  /** Kararlı bir referans olmalıdır; klavye dinleyicisi buna bağlıdır. */
  onClose: () => void;
}) {
  const [outcome, setOutcome] = useState<{
    movieId: number;
    state: DetailState;
  } | null>(null);

  const backdropRef = useRef<HTMLDivElement | null>(null);
  // İçerikte başlayıp arka planda biten bir sürükleme, `click` olayını ortak
  // ata olan arka planda tetikler. Kapanma için basma ANININ da arka planda
  // olması şart koşulur; metin seçerken modal kazara kapanmaz.
  const pointerDownOnBackdropRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;

  const movieId = movie.id;

  // Detay isteği. Film değiştiğinde yeni bir AbortController kurulur; temizlik
  // hem kapanışta hem de film değişiminde uçuştaki isteği iptal eder.
  useEffect(() => {
    const controller = new AbortController();

    fetchJson<MovieDetailsResult>(`/api/movies/${movieId}`, controller.signal)
      .then((data) =>
        setOutcome({ movieId, state: { status: "success", data } }),
      )
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setOutcome({
          movieId,
          state: { status: "error", error: toApiError(error) },
        });
      });

    return () => controller.abort();
  }, [movieId]);

  // Gövde kaydırması kilitlenir; temizlik önceki satır içi değerleri tam
  // olarak geri yükler.
  useEffect(
    () =>
      lockBodyScroll({
        body: document.body,
        documentElement: document.documentElement,
        innerWidth: window.innerWidth,
      }),
    [],
  );

  // Açılışta kapatma düğmesine odaklanılır; kapanışta odak, modalı açan
  // elemana geri verilir.
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    closeButtonRef.current?.focus();

    return () => {
      // Açan eleman bu arada DOM'dan kalktıysa odak zorlanmaz.
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  // Escape kapatır; Tab odağı modalın dışına çıkaramaz.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ];

      const target = resolveFocusTrapTarget(
        focusable,
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null,
        event.shiftKey,
      );

      if (target) {
        event.preventDefault();
        target.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Görüntülenen durum, isteğin ait olduğu film kimliğinden TÜRETİLİR: geç
  // gelen eski bir yanıt yeni filmin ekranını boyayamaz.
  const detailState = stateForMovie(outcome, movieId, LOADING_STATE);

  const details: MovieDetails | null =
    detailState.status === "success" ? detailState.data.movie : null;

  const providerState: ProviderState =
    detailState.status === "success"
      ? { status: "success", data: detailState.data.providers }
      : detailState.status === "error"
        ? { status: "error", error: detailState.error }
        : { status: "loading" };

  // Detay yüklenene kadar arama sonucundaki bilgiler gösterilir.
  const title = details?.title ?? movie.title;
  const originalTitle = details?.originalTitle ?? movie.originalTitle;
  const releaseYear = details?.releaseYear ?? movie.releaseYear;
  const voteAverage = details?.voteAverage ?? movie.voteAverage;
  const posterUrl = details?.posterUrl ?? movie.posterUrl;
  const overview = details?.overview ?? movie.overview;
  const runtime = formatRuntime(details?.runtimeMinutes ?? null);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={backdropRef}
      // Kapanma yalnızca arka planın KENDİSİNE yapılan tıklamada olur; içerikten
      // köpüren olaylar `shouldCloseOnBackdropClick` tarafından elenir.
      onPointerDown={(event) => {
        pointerDownOnBackdropRef.current = shouldCloseOnBackdropClick(
          event.target,
          backdropRef.current,
        );
      }}
      onClick={(event) => {
        const closes =
          pointerDownOnBackdropRef.current &&
          shouldCloseOnBackdropClick(event.target, backdropRef.current);

        pointerDownOnBackdropRef.current = false;

        if (closes) onClose();
      }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="flex h-[92dvh] w-full flex-col overflow-y-auto overscroll-contain rounded-t-2xl border border-white/15 bg-background text-foreground shadow-2xl sm:h-auto sm:max-h-[88dvh] sm:max-w-2xl sm:rounded-2xl"
      >
        <BackdropArea
          url={details?.backdropUrl ?? null}
          title={title}
          loading={detailState.status === "loading"}
          closeButtonRef={closeButtonRef}
          onClose={onClose}
        />

        <div className="flex flex-col gap-5 p-4 sm:p-6">
          <div className="flex items-start gap-4">
            <PosterArea url={posterUrl} title={title} />

            <div className="min-w-0 flex-1">
              <h2
                id={titleId}
                className="text-xl leading-tight font-bold break-words sm:text-2xl"
              >
                {title}
              </h2>

              {originalTitle ? (
                <p className="mt-1 text-sm break-words text-black/60 dark:text-white/60">
                  {originalTitle}
                </p>
              ) : null}

              <MetadataRow
                releaseYear={releaseYear}
                runtime={runtime}
                voteAverage={voteAverage}
              />

              {details && details.genres.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {details.genres.map((genre) => (
                    <li
                      key={genre}
                      className="rounded-full border border-black/15 px-2 py-0.5 text-xs dark:border-white/20"
                    >
                      {genre}
                    </li>
                  ))}
                </ul>
              ) : null}

              {details?.director ? (
                <p className="mt-3 text-sm">
                  <span className="text-black/50 dark:text-white/50">
                    Yönetmen:{" "}
                  </span>
                  <span className="font-medium">{details.director}</span>
                </p>
              ) : null}
            </div>
          </div>

          <p
            id={descriptionId}
            className="text-sm leading-relaxed text-black/75 dark:text-white/75"
          >
            {overview ?? "Bu film için TMDb üzerinde özet bulunmuyor."}
          </p>

          {detailState.status === "error" ? (
            <StatusMessage tone="error" title="Film bilgileri alınamadı">
              {detailState.error.message}
            </StatusMessage>
          ) : null}

          <div className="border-t border-black/10 pt-5 dark:border-white/15">
            <LibraryActions movie={details ?? movie} />
          </div>

          <section
            aria-live="polite"
            className="border-t border-black/10 pt-5 dark:border-white/15"
          >
            <h3 className="text-xs font-semibold tracking-wide text-black/50 uppercase dark:text-white/50">
              Türkiye&apos;de abonelik durumu
            </h3>
            <div className="mt-3">
              <ProviderAvailabilitySection state={providerState} />
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Arka plan görseli alanı.
 *
 * Oran (16/9) görsel gelmeden ÖNCE ayrılır; görsel yüklendiğinde ya da hiç
 * gelmediğinde düzen kaymaz.
 */
function BackdropArea({
  url,
  title,
  loading,
  closeButtonRef,
  onClose,
}: {
  url: string | null;
  title: string;
  loading: boolean;
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  return (
    <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden bg-black/10 dark:bg-white/10">
      {url ? (
        <Image
          src={url}
          alt=""
          fill
          sizes="(max-width: 640px) 100vw, 672px"
          className="object-cover"
          priority
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-full w-full items-center justify-center text-xs text-black/40 dark:text-white/40"
        >
          {loading ? "Yükleniyor…" : "Görsel yok"}
        </div>
      )}

      {/* Başlık ve kapatma düğmesinin okunabilirliği için üst katman. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/40"
      />

      <button
        ref={closeButtonRef}
        type="button"
        onClick={onClose}
        aria-label={`${title} detaylarını kapat`}
        className="absolute top-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-lg leading-none text-white backdrop-blur-sm transition-colors hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}

/** Afiş alanı. Oran (2/3) görsel gelmeden önce ayrılır. */
function PosterArea({ url, title }: { url: string | null; title: string }) {
  return (
    <div className="relative aspect-[2/3] w-24 shrink-0 overflow-hidden rounded-lg bg-black/10 sm:w-32 dark:bg-white/10">
      {url ? (
        <Image
          src={url}
          alt={`${title} afişi`}
          fill
          sizes="(max-width: 640px) 96px, 128px"
          className="object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-full w-full items-center justify-center text-center text-[10px] leading-tight text-black/50 dark:text-white/50"
        >
          Afiş
          <br />
          yok
        </div>
      )}
    </div>
  );
}

function MetadataRow({
  releaseYear,
  runtime,
  voteAverage,
}: {
  releaseYear: number | null;
  runtime: string | null;
  voteAverage: number | null;
}) {
  const parts = [
    releaseYear !== null ? String(releaseYear) : "Yıl bilgisi yok",
    runtime,
    voteAverage !== null ? `TMDb ${voteAverage.toFixed(1)}` : null,
  ].filter((part): part is string => part !== null);

  return (
    <p className="mt-2 text-sm text-black/60 dark:text-white/60">
      {parts.join(" · ")}
    </p>
  );
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError(
    "unexpected",
    "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.",
  );
}
