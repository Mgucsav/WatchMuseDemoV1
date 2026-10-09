"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
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
import type { LibraryItem, LibraryStatus } from "@/lib/library/types";

const RATINGS = Array.from({ length: RATING_MAX - RATING_MIN + 1 }, (_, index) => RATING_MIN + index);

const STATUSES: { value: LibraryStatus; label: string }[] = [
  { value: "watchlist", label: "İzlenecek" },
  { value: "watched", label: "İzledim" },
];

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

/** Seçili hali dolgulu görünen, klavyeyle de kullanılabilen radyo düğmesi. */
function ChoicePill({
  name,
  value,
  label,
  checked,
  onSelect,
  size = "md",
}: {
  name: string;
  value: string;
  label: string;
  checked: boolean;
  onSelect?: () => void;
  size?: "sm" | "md";
}) {
  return (
    <label className="cursor-pointer">
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={checked}
        onChange={onSelect}
        className="peer sr-only"
      />
      <span
        className={`flex items-center justify-center rounded-lg border border-line-20 text-sm transition-colors peer-checked:border-transparent peer-checked:bg-fill-inverse peer-checked:font-semibold peer-checked:text-on-inverse peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-wm-foreground hover:bg-fill-hover ${
          size === "sm" ? "h-10 min-w-10 px-2" : "min-h-10 px-4"
        }`}
      >
        {label}
      </span>
    </label>
  );
}

function withSession(
  action: (previousState: LibraryActionState, formData: FormData) => Promise<LibraryActionState>,
) {
  return async (previousState: LibraryActionState, formData: FormData) => {
    try {
      await ensureSupabaseAnonymousSession();
    } catch {
      return {
        error: "Kişisel listeniz şu anda hazırlanamadı. Sayfayı yenileyip tekrar deneyin.",
        notice: null,
      };
    }
    return action(previousState, formData);
  };
}

const dateFormat = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric" });

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
}

/**
 * Kütüphanedeki tek film: kapalıyken tek satırlık özet, "Düzenle" ile durum,
 * puan ve not formu açılır.
 */
export function LibraryItemCard({ item }: { item: LibraryItem }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<LibraryStatus>(item.status);
  const [updateState, updateAction] = useActionState(
    withSession(updateLibraryItemAction),
    EMPTY_LIBRARY_STATE,
  );
  const [deleteState, deleteAction] = useActionState(
    withSession(deleteLibraryItemAction),
    EMPTY_LIBRARY_STATE,
  );

  const isWatched = item.status === "watched";
  const date = isWatched
    ? formatDate(item.watchedAt ?? item.updatedAt)
    : formatDate(item.createdAt);
  const editorId = `library-editor-${item.id}`;

  return (
    <li className="rounded-xl border border-line-10">
      <div className="flex items-center gap-3 p-3">
        {item.posterUrl ? (
          <Image
            src={item.posterUrl}
            alt=""
            width={40}
            height={60}
            className="h-[60px] w-10 shrink-0 rounded object-cover bg-fill-placeholder"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-[60px] w-10 shrink-0 items-center justify-center rounded bg-fill-placeholder text-center text-[9px] leading-tight text-ink-50"
          >
            Afiş yok
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{item.movieTitle}</p>
          <p className="mt-0.5 text-xs text-ink-60">
            {isWatched ? "İzlendi" : "Eklendi"}
            {date ? ` · ${date}` : ""}
          </p>
          {item.note ? (
            <p className="mt-0.5 truncate text-xs text-ink-55">“{item.note}”</p>
          ) : null}
        </div>

        {isWatched ? (
          <span
            className={`shrink-0 text-right font-display leading-none ${
              item.rating !== null ? "text-[28px] text-brand-red" : "text-sm text-ink-45"
            }`}
            aria-label={item.rating !== null ? `Puanınız ${item.rating}/10` : "Puan verilmedi"}
          >
            {item.rating ?? "—"}
            {item.rating !== null ? <span className="text-xs text-ink-50">/10</span> : null}
          </span>
        ) : null}

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={editorId}
          className="min-h-9 shrink-0 rounded-lg border border-line-20 px-3 text-xs hover:bg-fill-hover"
        >
          {open ? "Kapat" : "Düzenle"}
        </button>
      </div>

      {open ? (
        <div id={editorId} className="flex flex-col gap-4 border-t border-line-10 p-3">
          {updateState.error ? (
            <StatusMessage tone="error">{updateState.error}</StatusMessage>
          ) : null}
          {updateState.notice ? <StatusMessage>{updateState.notice}</StatusMessage> : null}
          {deleteState.error ? (
            <StatusMessage tone="error">{deleteState.error}</StatusMessage>
          ) : null}

          <form action={updateAction} className="flex flex-col gap-4">
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="currentStatus" value={item.status} />

            <fieldset>
              <legend className="text-xs text-ink-60">Durum</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {STATUSES.map((option) => (
                  <ChoicePill
                    key={option.value}
                    name="status"
                    value={option.value}
                    label={option.label}
                    checked={item.status === option.value}
                    onSelect={() => setStatus(option.value)}
                  />
                ))}
              </div>
            </fieldset>

            {status === "watched" ? (
              <fieldset>
                <legend className="text-xs text-ink-60">
                  Puan ({RATING_MIN}–{RATING_MAX})
                </legend>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {RATINGS.map((value) => (
                    <ChoicePill
                      key={value}
                      name="rating"
                      value={String(value)}
                      label={String(value)}
                      checked={item.rating === value}
                      size="sm"
                    />
                  ))}
                  <ChoicePill
                    name="rating"
                    value=""
                    label="Puansız"
                    checked={item.rating === null}
                  />
                </div>
              </fieldset>
            ) : null}

            <div>
              <label htmlFor={`note-${item.id}`} className="block text-xs text-ink-60">
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
              className="min-h-11 self-start rounded-lg bg-fill-inverse px-5 text-sm font-semibold text-on-inverse disabled:opacity-60"
            />
          </form>

          <form action={deleteAction} className="border-t border-line-10 pt-3">
            <input type="hidden" name="itemId" value={item.id} />
            <PendingButton
              label="Kütüphaneden kaldır"
              pendingLabel="Kaldırılıyor…"
              className="min-h-10 rounded-lg border border-error-line px-3 text-sm text-error-ink disabled:opacity-60"
            />
          </form>
        </div>
      ) : null}
    </li>
  );
}
