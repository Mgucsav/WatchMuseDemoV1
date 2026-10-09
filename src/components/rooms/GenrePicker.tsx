"use client";

import { MAX_ROOM_GENRES, ROOM_GENRE_OPTIONS, type RoomGenre } from "@/lib/tmdb/genres";

/**
 * Tur için isteğe bağlı tür seçimi. Hiçbiri seçilmezse tür kısıtı yoktur;
 * en fazla MAX_ROOM_GENRES tür seçilebilir ve film bunlardan birine uymalıdır.
 */
export function GenrePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: RoomGenre[];
  onChange: (next: RoomGenre[]) => void;
  disabled?: boolean;
}) {
  const full = value.length >= MAX_ROOM_GENRES;

  function toggle(genre: RoomGenre) {
    onChange(value.includes(genre) ? value.filter((item) => item !== genre) : [...value, genre]);
  }

  return (
    <fieldset disabled={disabled} className="flex flex-col gap-2">
      <legend className="text-sm font-semibold">
        Tür <span className="font-normal text-ink-55">(isteğe bağlı, en fazla {MAX_ROOM_GENRES})</span>
      </legend>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange([])}
          aria-pressed={value.length === 0}
          className={`min-h-9 rounded-full border px-3 text-sm transition-colors ${
            value.length === 0
              ? "border-brand-green bg-fill-hover font-semibold"
              : "border-line-20 text-ink-70 hover:bg-fill-hover"
          }`}
        >
          Hepsi
        </button>
        {ROOM_GENRE_OPTIONS.map((genre) => {
          const selected = value.includes(genre);
          return (
            <button
              key={genre}
              type="button"
              onClick={() => toggle(genre)}
              aria-pressed={selected}
              disabled={!selected && full}
              className={`min-h-9 rounded-full border px-3 text-sm transition-colors disabled:opacity-40 ${
                selected
                  ? "border-brand-green bg-fill-hover font-semibold"
                  : "border-line-20 text-ink-70 hover:bg-fill-hover"
              }`}
            >
              {genre}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-ink-55">
        {value.length === 0
          ? "Tüm türlerden, odadakilerin zevkine göre seçilir."
          : `Filmler şu türlerden en az birine uyar: ${value.join(", ")}.`}
      </p>
    </fieldset>
  );
}
