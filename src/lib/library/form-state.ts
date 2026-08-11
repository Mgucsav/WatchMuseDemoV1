/**
 * Kütüphane formlarının paylaşılan durum tipi.
 *
 * AYRI DOSYADA OLMASININ SEBEBİ: `"use server"` işaretli bir modül yalnızca
 * **async fonksiyon** export edebilir; sabit nesne export etmek derlemeyi kırar.
 */

export interface LibraryActionState {
  error: string | null;
  notice: string | null;
}

export const EMPTY_LIBRARY_STATE: LibraryActionState = {
  error: null,
  notice: null,
};
