/**
 * Auth formlarının paylaşılan durum tipi.
 *
 * AYRI DOSYADA OLMASININ SEBEBİ: `"use server"` işaretli bir modül yalnızca
 * **async fonksiyon** export edebilir. Sabit bir nesneyi orada export etmek
 * derlemeyi kırar (`invalid-use-server-value`). Bu yüzden durum tipi ve
 * başlangıç değeri burada durur.
 */

export interface AuthFormState {
  error: string | null;
  notice: string | null;
}

export const EMPTY_AUTH_STATE: AuthFormState = { error: null, notice: null };
