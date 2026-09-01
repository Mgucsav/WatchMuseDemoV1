/** Teleparty davet bağlantısının istemci ve sunucuda paylaşılan doğrulayıcısı. */

const TELEPARTY_HOST = "redirect.teleparty.com";
const TELEPARTY_JOIN_PATH = /^\/join\/[A-Za-z0-9_-]{16,128}$/;

/**
 * Yalnızca resmi HTTPS Teleparty katılım adresini kabul edip kanonik biçimde
 * döndürür. Kullanıcı bilgisi, sorgu veya fragment kabul edilmez.
 */
export function parseTelepartyJoinUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 256) return null;

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== TELEPARTY_HOST ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    !TELEPARTY_JOIN_PATH.test(url.pathname)
  ) {
    return null;
  }

  return `https://${TELEPARTY_HOST}${url.pathname}`;
}
