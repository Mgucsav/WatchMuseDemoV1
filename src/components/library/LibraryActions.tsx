"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { StatusMessage } from "@/components/StatusMessage";
import { saveToLibraryAction } from "@/lib/library/actions";
import {
  EMPTY_LIBRARY_STATE,
  type LibraryActionState,
} from "@/lib/library/form-state";
import { ensureSupabaseAnonymousSession } from "@/lib/supabase/browser";
import type { LibraryStatus } from "@/lib/library/types";
import type { MovieSummary } from "@/lib/tmdb/types";

const buttonClass =
  "min-h-11 flex-1 rounded-lg border border-black/20 px-3 py-2 text-sm font-medium hover:bg-black/[0.04] disabled:opacity-60 dark:border-white/25 dark:hover:bg-white/10";

function SaveButton({ label, status }: { label: string; status: LibraryStatus }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name="status"
      value={status}
      disabled={pending}
      className={buttonClass}
    >
      {pending ? "Kaydediliyor…" : label}
    </button>
  );
}

/**
 * Seçili film için kütüphane aksiyonları.
 *
 * Ziyaretçi önce anonim Supabase kimliğiyle başlar; dolayısıyla ürünün değerini
 * görmeden kayıt duvarıyla karşılaşmaz. Kimlik oluşturma, Server Action'dan
 * hemen önce de garanti edilir; sunucu tarafındaki sahiplik kontrolü ve RLS
 * yine asıl güvenlik katmanlarıdır.
 */
export function LibraryActions({ movie }: { movie: MovieSummary }) {
  const [state, formAction] = useActionState(
    async (previousState: LibraryActionState, formData: FormData) => {
      try {
        await ensureSupabaseAnonymousSession();
      } catch {
        return {
          error: "Kişisel listeniz şu anda hazırlanamadı. Sayfayı yenileyip tekrar deneyin.",
          notice: null,
        };
      }

      return saveToLibraryAction(previousState, formData);
    },
    EMPTY_LIBRARY_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="tmdbMovieId" value={movie.id} />
      <input type="hidden" name="movieTitle" value={movie.title} />
      {movie.posterPath ? (
        <input type="hidden" name="posterPath" value={movie.posterPath} />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <SaveButton label="İzleneceklere ekle" status="watchlist" />
        <SaveButton label="İzlendi olarak işaretle" status="watched" />
      </div>

      {state.error ? (
        <StatusMessage tone="error">{state.error}</StatusMessage>
      ) : null}
      {state.notice ? (
        <StatusMessage>
          {state.notice}{" "}
          <Link href="/kutuphanem" className="underline underline-offset-4">
            Kütüphaneme git
          </Link>
        </StatusMessage>
      ) : null}
    </form>
  );
}
