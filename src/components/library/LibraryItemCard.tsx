"use client";

import Image from "next/image";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { StatusMessage } from "@/components/StatusMessage";
import {
  deleteLibraryItemAction,
  updateLibraryItemAction,
} from "@/lib/library/actions";
import {
  EMPTY_LIBRARY_STATE,
  type LibraryActionState,
} from "@/lib/library/form-state";
import { ensureSupabaseAnonymousSession } from "@/lib/supabase/browser";
import { NOTE_MAX_LENGTH, RATING_MAX, RATING_MIN } from "@/lib/library/validation";
import type { LibraryItem } from "@/lib/library/types";

function PendingButton({
  label,
  pendingLabel,
  className,
}: {
  label: string;
  pendingLabel: string;
  className: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : label}
    </button>
  );
}

const buttonClass =
  "min-h-11 rounded-lg border border-line-20 px-3 py-2 text-sm hover:bg-fill-hover disabled:opacity-60";

export function LibraryItemCard({ item }: { item: LibraryItem }) {
  const [updateState, updateAction] = useActionState(
    async (previousState: LibraryActionState, formData: FormData) => {
      try {
        await ensureSupabaseAnonymousSession();
      } catch {
        return {
          error: "Kişisel listeniz şu anda hazırlanamadı. Sayfayı yenileyip tekrar deneyin.",
          notice: null,
        };
      }

      return updateLibraryItemAction(previousState, formData);
    },
    EMPTY_LIBRARY_STATE,
  );
  const [deleteState, deleteAction] = useActionState(
    async (previousState: LibraryActionState, formData: FormData) => {
      try {
        await ensureSupabaseAnonymousSession();
      } catch {
        return {
          error: "Kişisel listeniz şu anda hazırlanamadı. Sayfayı yenileyip tekrar deneyin.",
          notice: null,
        };
      }

      return deleteLibraryItemAction(previousState, formData);
    },
    EMPTY_LIBRARY_STATE,
  );

  const isWatched = item.status === "watched";

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line-10 p-3">
      <div className="flex items-start gap-3">
        {item.posterUrl ? (
          <Image
            src={item.posterUrl}
            alt={`${item.movieTitle} afişi`}
            width={56}
            height={84}
            className="h-[84px] w-14 shrink-0 rounded object-cover bg-fill-placeholder"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-[84px] w-14 shrink-0 items-center justify-center rounded bg-fill-placeholder text-center text-[10px] leading-tight text-ink-50"
          >
            Afiş
            <br />
            yok
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold break-words">{item.movieTitle}</p>
          <p className="mt-0.5 text-xs text-ink-60">
            {isWatched ? "İzlendi" : "İzlenecek"}
            {item.rating !== null ? ` · Puanınız: ${item.rating}/10` : ""}
          </p>
        </div>
      </div>

      {updateState.error ? (
        <StatusMessage tone="error">{updateState.error}</StatusMessage>
      ) : null}
      {updateState.notice ? (
        <StatusMessage>{updateState.notice}</StatusMessage>
      ) : null}
      {deleteState.error ? (
        <StatusMessage tone="error">{deleteState.error}</StatusMessage>
      ) : null}

      <form action={updateAction} className="flex flex-col gap-3">
        <input type="hidden" name="itemId" value={item.id} />

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor={`status-${item.id}`}
              className="block text-xs text-ink-60"
            >
              Durum
            </label>
            <select
              id={`status-${item.id}`}
              name="status"
              defaultValue={item.status}
              className="mt-1 min-h-11 rounded-lg border border-line-20 bg-transparent px-2 py-2 text-sm"
            >
              <option value="watchlist">İzlenecek</option>
              <option value="watched">İzledim</option>
            </select>
          </div>

          <div>
            <label
              htmlFor={`rating-${item.id}`}
              className="block text-xs text-ink-60"
            >
              Puan ({RATING_MIN}–{RATING_MAX})
            </label>
            <select
              id={`rating-${item.id}`}
              name="rating"
              defaultValue={item.rating === null ? "" : String(item.rating)}
              className="mt-1 min-h-11 rounded-lg border border-line-20 bg-transparent px-2 py-2 text-sm"
            >
              <option value="">—</option>
              {Array.from({ length: RATING_MAX }, (_, index) => index + 1).map(
                (value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ),
              )}
            </select>
            <p className="mt-1 text-xs text-ink-50">
              Yalnızca izlenen filmlerde
            </p>
          </div>
        </div>

        <div>
          <label
            htmlFor={`note-${item.id}`}
            className="block text-xs text-ink-60"
          >
            Not
          </label>
          <textarea
            id={`note-${item.id}`}
            name="note"
            rows={3}
            maxLength={NOTE_MAX_LENGTH}
            defaultValue={item.note ?? ""}
            className="mt-1 w-full rounded-lg border border-line-20 bg-transparent px-3 py-2 text-sm"
          />
        </div>

        <PendingButton
          label="Kaydet"
          pendingLabel="Kaydediliyor…"
          className={`${buttonClass} self-start`}
        />
      </form>

      <form action={deleteAction}>
        <input type="hidden" name="itemId" value={item.id} />
        <PendingButton
          label="Kütüphaneden kaldır"
          pendingLabel="Kaldırılıyor…"
          className={`${buttonClass} text-ink-70`}
        />
      </form>
    </li>
  );
}
