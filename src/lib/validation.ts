/**
 * Dış girdiyi (URL segmentleri, query parametreleri) doğrulayan saf yardımcılar.
 *
 * Bu modül bilinçli olarak `server-only` değildir ve hiçbir I/O yapmaz;
 * saf fonksiyonlardan oluştuğu için doğrudan test edilebilir.
 */

/**
 * Bir yol segmentini TMDb film ID'sine çevirir.
 *
 * Yalnızca **tam olarak** pozitif, güvenli bir tam sayıyı temsil eden metin
 * kabul edilir. `Number.parseInt` bilinçli olarak kullanılmaz: `parseInt("123abc")`
 * sessizce `123` döndürür ve bozuk girdiyi geçerli hale getirir.
 *
 * Reddedilenler: `""`, `"0"`, `"-1"`, `"1.5"`, `"1.0"`, `"123abc"`, `"+1"`,
 * `" 1 "`, `"1e3"`, `"0123"` (kanonik olmayan), `"9007199254740993"` (güvensiz).
 */
export function parseMovieId(value: unknown): number | null {
  if (typeof value !== "string") return null;

  // Yalnızca rakam. Boşluk, işaret, ondalık ayırıcı ve üstel gösterim elenir.
  if (!/^[0-9]+$/.test(value)) return null;

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;

  // Kanonik gösterim şartı: "0123" gibi baştaki sıfırlı biçimleri eler ve
  // güvenli tam sayı sınırında yuvarlanan değerleri yakalar.
  if (String(parsed) !== value) return null;

  return parsed;
}
