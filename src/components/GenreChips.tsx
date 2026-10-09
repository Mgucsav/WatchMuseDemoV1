/**
 * Film türü etiketleri ("Korku", "Anime", "Romantik komedi"…).
 *
 * Yalnızca `span`'lerden oluşur; düğme içinde (arama sonucu satırı) güvenle
 * kullanılabilir. En fazla `max` etiket gösterilir.
 */
export function GenreChips({
  genres,
  max = 3,
  className = "",
}: {
  genres: readonly string[];
  max?: number;
  className?: string;
}) {
  if (genres.length === 0) return null;
  return (
    <span className={`flex flex-wrap gap-1 ${className}`}>
      {genres.slice(0, max).map((genre) => (
        <span
          key={genre}
          className="rounded-full border border-line-15 px-2 py-0.5 text-[11px] leading-4 text-ink-70"
        >
          {genre}
        </span>
      ))}
    </span>
  );
}
