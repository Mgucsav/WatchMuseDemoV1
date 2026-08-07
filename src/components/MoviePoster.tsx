import Image from "next/image";

import type { MovieSummary } from "@/lib/tmdb/types";

const SIZES = {
  sm: { width: 56, height: 84, className: "w-14 h-[84px]" },
  lg: { width: 80, height: 120, className: "w-20 h-[120px]" },
} as const;

/** TMDb afişi. Afiş yolu yoksa aynı ölçüde bir yer tutucu gösterilir. */
export function MoviePoster({
  movie,
  size = "sm",
}: {
  movie: MovieSummary;
  size?: keyof typeof SIZES;
}) {
  const { width, height, className } = SIZES[size];

  if (!movie.posterUrl) {
    return (
      <div
        className={`${className} shrink-0 rounded flex items-center justify-center bg-black/5 text-[10px] leading-tight text-center text-black/50 dark:bg-white/10 dark:text-white/50`}
        aria-hidden="true"
      >
        Afiş
        <br />
        yok
      </div>
    );
  }

  return (
    <Image
      src={movie.posterUrl}
      alt={`${movie.title} afişi`}
      width={width}
      height={height}
      className={`${className} shrink-0 rounded object-cover bg-black/5 dark:bg-white/10`}
    />
  );
}
