/** Teleparty davet bağlantısının istemci ve sunucuda paylaşılan doğrulayıcısı. */

const TELEPARTY_HOST = "redirect.teleparty.com";
const TELEPARTY_JOIN_HOSTS = new Set([
  TELEPARTY_HOST,
  "www.teleparty.com",
  "teleparty.com",
]);
const TELEPARTY_JOIN_PATH = /^\/join\/([A-Za-z0-9_-]{16,128})\/?$/;

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
    !TELEPARTY_JOIN_HOSTS.has(url.hostname.toLowerCase()) ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    !TELEPARTY_JOIN_PATH.test(url.pathname)
  ) {
    return null;
  }

  const token = TELEPARTY_JOIN_PATH.exec(url.pathname)?.[1];
  if (!token) return null;

  // Veritabanındaki mevcut sıkı sözleşmeyle geriye uyumluluk için yeni
  // www.teleparty.com biçimini eski resmi redirect hostuna kanonikleştiririz.
  // Takip sorguları/fragmentler bilinçli olarak atılır.
  return `https://${TELEPARTY_HOST}/join/${token}`;
}

export interface TelepartyProviderLaunch {
  key: "netflix" | "prime_video" | "disney_plus";
  label: string;
  url: string;
}

/**
 * Teleparty'nin desteklediği ortak sağlayıcıların gerçek yayın sitesi arama
 * hedeflerini üretir. Teleparty tanıtım/katalog sayfası bilinçli olarak yoktur:
 * uzantı ancak yayın sitesinde video oynarken parti başlatabilir.
 */
export function telepartyProviderLaunches(
  title: string,
  availableProviderKeys: readonly string[],
): TelepartyProviderLaunch[] {
  const query = encodeURIComponent(title.trim());
  if (query === "") return [];
  const available = new Set(availableProviderKeys);
  const targets: TelepartyProviderLaunch[] = [];

  if (available.has("netflix")) {
    targets.push({
      key: "netflix",
      label: "Netflix",
      url: `https://www.netflix.com/search?q=${query}`,
    });
  }
  if (available.has("prime_video")) {
    targets.push({
      key: "prime_video",
      label: "Prime Video",
      url: `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${query}`,
    });
  }
  if (available.has("disney_plus")) {
    targets.push({
      key: "disney_plus",
      label: "Disney+",
      // Disney+ web araması başlığı URL ile güvenilir biçimde önceden
      // doldurmuyor; yine de doğru, uzantı-destekli yayın sitesini açar.
      url: "https://www.disneyplus.com/search",
    });
  }

  return targets;
}
