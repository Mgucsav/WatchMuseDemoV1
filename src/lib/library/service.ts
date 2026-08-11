import "server-only";

import { AuthRequiredError, requireCurrentActor } from "@/lib/auth/dal";
import { toPosterUrl } from "@/lib/tmdb/normalize";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { LibraryItem, LibraryStatus, LibrarySummary } from "./types";

/**
 * Sunucu-only kişisel kütüphane servisi.
 *
 * Yetkilendirme İKİ katmanlıdır:
 *   1. Burada `requireCurrentActor()` — Supabase kimliği yoksa istek hiç
 *      gönderilmez. Anonim kimlik de geçerlidir; kullanıcı ürünü denedikten
 *      sonra aynı kimliği kalıcı hesabına bağlayabilir.
 *   2. Veritabanında RLS — uygulama katmanı atlansa bile kullanıcı yalnızca
 *      kendi satırlarını görebilir/değiştirebilir.
 *
 * `user_id` daima sunucuda doğrulanmış kimlikten alınır; istemciden GELEN bir
 * kullanıcı kimliğine asla güvenilmez.
 */

export class LibraryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LibraryError";
    this.code = code;
  }
}

const SELECT_COLUMNS =
  "id, tmdb_movie_id, movie_title, poster_path, status, rating, note, watched_at, created_at, updated_at";

function toLibraryItem(row: Record<string, unknown>): LibraryItem | null {
  const id = typeof row.id === "string" ? row.id : null;
  const tmdbMovieId =
    typeof row.tmdb_movie_id === "number" ? row.tmdb_movie_id : null;
  const movieTitle =
    typeof row.movie_title === "string" ? row.movie_title : null;

  if (!id || tmdbMovieId === null || !movieTitle) return null;

  const posterPath =
    typeof row.poster_path === "string" && row.poster_path !== ""
      ? row.poster_path
      : null;

  const status: LibraryStatus = row.status === "watched" ? "watched" : "watchlist";
  const rating =
    typeof row.rating === "number" && row.rating >= 1 && row.rating <= 10
      ? row.rating
      : null;

  return {
    id,
    tmdbMovieId,
    movieTitle,
    posterPath,
    posterUrl: toPosterUrl(posterPath),
    status,
    rating,
    note: typeof row.note === "string" && row.note !== "" ? row.note : null,
    watchedAt: typeof row.watched_at === "string" ? row.watched_at : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
  };
}

async function client() {
  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) {
    throw new LibraryError(
      "not_configured",
      "Hesap servisi henüz yapılandırılmamış.",
    );
  }
  return supabase;
}

/** Kullanıcının tüm kütüphanesini iki bölüm halinde döndürür. */
export async function getLibrary(): Promise<LibrarySummary> {
  const user = await requireCurrentActor();
  const supabase = await client();

  const { data, error } = await supabase
    .from("library_items")
    .select(SELECT_COLUMNS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new LibraryError("unexpected", "Kütüphane yüklenemedi.");
  }

  const items = (data ?? [])
    .map((row) => toLibraryItem(row as Record<string, unknown>))
    .filter((item): item is LibraryItem => item !== null);

  return {
    watchlist: items.filter((item) => item.status === "watchlist"),
    watched: items.filter((item) => item.status === "watched"),
  };
}

export interface UpsertInput {
  tmdbMovieId: number;
  movieTitle: string;
  posterPath: string | null;
  status: LibraryStatus;
}

/**
 * Filmi kütüphaneye ekler veya durumunu günceller.
 *
 * `unique(user_id, tmdb_movie_id)` kısıtı sayesinde aynı film tekrar eklenmez;
 * `upsert` mevcut kaydı günceller.
 */
export async function upsertLibraryItem(input: UpsertInput): Promise<void> {
  const user = await requireCurrentActor();
  const supabase = await client();

  const isWatched = input.status === "watched";

  const { error } = await supabase.from("library_items").upsert(
    {
      user_id: user.id,
      tmdb_movie_id: input.tmdbMovieId,
      movie_title: input.movieTitle,
      poster_path: input.posterPath,
      status: input.status,
      watched_at: isWatched ? new Date().toISOString() : null,
      // İzleneceklere taşınırsa puan temizlenir: veritabanı kısıtı puanı
      // yalnızca izlenmiş filmlerde kabul eder.
      ...(isWatched ? {} : { rating: null }),
    },
    { onConflict: "user_id,tmdb_movie_id" },
  );

  if (error) {
    throw new LibraryError("unexpected", "Film kütüphaneye eklenemedi.");
  }
}

export interface UpdateInput {
  itemId: string;
  status?: LibraryStatus;
  rating?: number | null;
  note?: string | null;
}

/** Mevcut bir kaydın durumunu, puanını veya notunu günceller. */
export async function updateLibraryItem(input: UpdateInput): Promise<void> {
  const user = await requireCurrentActor();
  const supabase = await client();

  const patch: Record<string, unknown> = {};

  if (input.status !== undefined) {
    patch.status = input.status;
    patch.watched_at =
      input.status === "watched" ? new Date().toISOString() : null;
    if (input.status === "watchlist") patch.rating = null;
  }

  if (input.rating !== undefined) patch.rating = input.rating;
  if (input.note !== undefined) patch.note = input.note;

  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase
    .from("library_items")
    .update(patch)
    // `user_id` filtresi RLS'e EK bir güvenlik ağıdır; RLS zaten uygular.
    .eq("id", input.itemId)
    .eq("user_id", user.id);

  if (error) {
    throw new LibraryError("unexpected", "Kayıt güncellenemedi.");
  }
}

/** Kaydı siler. */
export async function deleteLibraryItem(itemId: string): Promise<void> {
  const user = await requireCurrentActor();
  const supabase = await client();

  const { error } = await supabase
    .from("library_items")
    .delete()
    .eq("id", itemId)
    .eq("user_id", user.id);

  if (error) {
    throw new LibraryError("unexpected", "Kayıt silinemedi.");
  }
}

/**
 * Belirli bir TMDb filminin kütüphanedeki durumu.
 * Giriş yoksa hata fırlatmaz; "kütüphanede değil" döner.
 */
export async function getEntryState(
  tmdbMovieId: number,
): Promise<{ inLibrary: boolean; status: LibraryStatus | null }> {
  try {
    const user = await requireCurrentActor();
    const supabase = await client();

    const { data } = await supabase
      .from("library_items")
      .select("status")
      .eq("user_id", user.id)
      .eq("tmdb_movie_id", tmdbMovieId)
      .maybeSingle();

    if (!data) return { inLibrary: false, status: null };

    return {
      inLibrary: true,
      status: data.status === "watched" ? "watched" : "watchlist",
    };
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return { inLibrary: false, status: null };
    }
    throw error;
  }
}
