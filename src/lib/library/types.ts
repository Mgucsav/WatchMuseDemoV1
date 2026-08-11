/**
 * Kişisel kütüphane sözleşmeleri.
 *
 * Yalnızca tip içerir; derleme sırasında silinir, istemci bileşenlerinden
 * güvenle import edilebilir.
 */

export type LibraryStatus = "watchlist" | "watched";

export interface LibraryItem {
  id: string;
  tmdbMovieId: number;
  movieTitle: string;
  /** TMDb ham afiş yolu (`/abc.jpg`) veya `null`. */
  posterPath: string | null;
  /** Doğrudan kullanılabilir tam afiş URL'si. */
  posterUrl: string | null;
  status: LibraryStatus;
  /** 1–10; yalnızca izlenmiş filmlerde dolu olabilir. */
  rating: number | null;
  note: string | null;
  /** ISO 8601 veya `null`. */
  watchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LibrarySummary {
  watchlist: LibraryItem[];
  watched: LibraryItem[];
}

/** Bir filmin kullanıcının kütüphanesindeki durumu (arama ekranı için). */
export interface LibraryEntryState {
  inLibrary: boolean;
  status: LibraryStatus | null;
}
