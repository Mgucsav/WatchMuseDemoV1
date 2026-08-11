"use server";

import { revalidatePath } from "next/cache";

import { AuthRequiredError } from "@/lib/auth/dal";
import type { LibraryActionState } from "./form-state";
import {
  LibraryError,
  deleteLibraryItem,
  updateLibraryItem,
  upsertLibraryItem,
} from "./service";
import {
  isLibraryStatus,
  parseMovieTitle,
  parseNote,
  parsePosterPath,
  parseRating,
  parseTmdbMovieId,
} from "./validation";

/**
 * Kütüphane Server Action'ları.
 *
 * Tüm girdiler sunucuda yeniden doğrulanır — istemci tarafı kontrollerine asla
 * güvenilmez. Yetkilendirme servis katmanında (`requireCurrentActor`) ve
 * veritabanında (RLS) iki kez uygulanır.
 */

const AUTH_REQUIRED: LibraryActionState = {
  error: "Bu işlem için giriş yapmanız gerekiyor.",
  notice: null,
};

function toState(error: unknown): LibraryActionState {
  if (error instanceof AuthRequiredError) return AUTH_REQUIRED;
  if (error instanceof LibraryError) return { error: error.message, notice: null };
  return { error: "Beklenmeyen bir hata oluştu.", notice: null };
}

/** Arama ekranından: filmi izleneceklere ekler veya izlendi işaretler. */
export async function saveToLibraryAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const tmdbMovieId = parseTmdbMovieId(formData.get("tmdbMovieId"));
  const movieTitle = parseMovieTitle(formData.get("movieTitle"));
  const status = formData.get("status");

  if (tmdbMovieId === null || movieTitle === null || !isLibraryStatus(status)) {
    return { error: "Film bilgisi okunamadı.", notice: null };
  }

  try {
    await upsertLibraryItem({
      tmdbMovieId,
      movieTitle,
      posterPath: parsePosterPath(formData.get("posterPath")),
      status,
    });
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/kutuphanem");

  return {
    error: null,
    notice:
      status === "watched"
        ? "İzlediklerinize eklendi."
        : "İzleneceklerinize eklendi.",
  };
}

/** Kütüphane ekranından: durum, puan ve not güncellemesi. */
export async function updateLibraryItemAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const itemId = formData.get("itemId");
  if (typeof itemId !== "string" || itemId === "") {
    return { error: "Kayıt bulunamadı.", notice: null };
  }

  const rawStatus = formData.get("status");
  const status = isLibraryStatus(rawStatus) ? rawStatus : undefined;

  const rating = parseRating(formData.get("rating"));
  if (rating === undefined) {
    return { error: "Puan 1 ile 10 arasında olmalı.", notice: null };
  }

  const note = parseNote(formData.get("note"));
  if (note === undefined) {
    return { error: "Not çok uzun (en fazla 2000 karakter).", notice: null };
  }

  try {
    await updateLibraryItem({ itemId, status, rating, note });
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/kutuphanem");

  return { error: null, notice: "Kaydedildi." };
}

/** Kütüphane ekranından: kaydı siler. */
export async function deleteLibraryItemAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const itemId = formData.get("itemId");
  if (typeof itemId !== "string" || itemId === "") {
    return { error: "Kayıt bulunamadı.", notice: null };
  }

  try {
    await deleteLibraryItem(itemId);
  } catch (error) {
    return toState(error);
  }

  revalidatePath("/kutuphanem");

  return { error: null, notice: "Kayıt silindi." };
}
