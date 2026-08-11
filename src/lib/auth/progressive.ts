/**
 * Kullanıcı üründen değer aldıktan sonra hesap bağlama çağrısının gösterileceği
 * eşik. Beş film, "liste gerçekten benim için önemli" hissi oluştururken
 * ilk deneyimi kayıt formuyla bölmez.
 */
export const ACCOUNT_SAVE_PROMPT_MIN_ITEMS = 5;

export function shouldPromptToSaveAccount(itemCount: number): boolean {
  return Number.isInteger(itemCount) && itemCount >= ACCOUNT_SAVE_PROMPT_MIN_ITEMS;
}
