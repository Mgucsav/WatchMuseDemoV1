/**
 * Supabase ortam değişkeni doğrulaması.
 *
 * NEDEN `NEXT_PUBLIC_` ÖNEKİ BURADA DOĞRU:
 * Supabase anon/publishable anahtarı **gizli bir bilgi değildir**. Tarayıcıda
 * çalışmak üzere tasarlanmıştır ve tek başına hiçbir yetki vermez; erişimi
 * belirleyen şey Row Level Security politikalarıdır. Bu yüzden bu iki değişken
 * bilinçli olarak herkese açıktır ve projedeki "gizli bilgi `NEXT_PUBLIC_`
 * olamaz" kuralını ihlal etmez.
 *
 * Gerçek gizli olan `service_role` anahtarı bu projede **hiç kullanılmaz**.
 *
 * Bu modül saf fonksiyonlardan oluşur ve doğrudan test edilebilir; modül
 * seviyesinde asla hata fırlatmaz, böylece Supabase yapılandırılmamışken de
 * `next build` başarılı olur.
 */

export const SUPABASE_URL_ENV = "NEXT_PUBLIC_SUPABASE_URL";
export const SUPABASE_ANON_KEY_ENV = "NEXT_PUBLIC_SUPABASE_ANON_KEY";
export const LOCAL_ROOMS_PUBLIC_ENV = "NEXT_PUBLIC_USE_LOCAL_ROOMS";
export const LOCAL_ROOMS_ENV = "USE_LOCAL_ROOMS";

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

export type SupabaseEnvResult =
  | { ok: true; env: SupabaseEnv }
  | { ok: false; missing: string[]; reason: string };

/**
 * Verilen kaynaktan Supabase yapılandırmasını doğrular.
 *
 * Hiçbir koşulda anahtarın DEĞERİNİ hata mesajına koymaz; yalnızca değişken
 * ADLARINI raporlar.
 */
export function validateSupabaseEnv(
  source: Record<string, string | undefined>,
): SupabaseEnvResult {
  const rawUrl = source[SUPABASE_URL_ENV]?.trim() ?? "";
  const rawKey = source[SUPABASE_ANON_KEY_ENV]?.trim() ?? "";

  const missing: string[] = [];
  if (rawUrl === "") missing.push(SUPABASE_URL_ENV);
  if (rawKey === "") missing.push(SUPABASE_ANON_KEY_ENV);

  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      reason: `Eksik ortam değişkeni: ${missing.join(", ")}`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      ok: false,
      missing: [SUPABASE_URL_ENV],
      reason: `${SUPABASE_URL_ENV} geçerli bir URL değil.`,
    };
  }

  const isLocal =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";

  if (parsed.protocol !== "https:" && !isLocal) {
    return {
      ok: false,
      missing: [SUPABASE_URL_ENV],
      reason: `${SUPABASE_URL_ENV} https olmalıdır (yerel geliştirme dışında).`,
    };
  }

  // Anahtarda boşluk olması neredeyse her zaman kopyalama hatasıdır ve
  // teşhis edilmesi zor 401'lere yol açar.
  if (/\s/.test(rawKey)) {
    return {
      ok: false,
      missing: [SUPABASE_ANON_KEY_ENV],
      reason: `${SUPABASE_ANON_KEY_ENV} boşluk içeriyor.`,
    };
  }

  return {
    ok: true,
    env: { url: parsed.origin, anonKey: rawKey },
  };
}

/**
 * Süreç ortamından okur.
 *
 * `process.env.NEXT_PUBLIC_*` değerleri Next.js tarafından derleme sırasında
 * gömüldüğü için burada **birebir üye erişimi** kullanılmalıdır; dinamik
 * indeksleme (`process.env[KEY]`) tarayıcı paketinde çözülmez.
 */
export function readSupabaseEnv(): SupabaseEnvResult {
  return validateSupabaseEnv({
    [SUPABASE_URL_ENV]: process.env.NEXT_PUBLIC_SUPABASE_URL,
    [SUPABASE_ANON_KEY_ENV]: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

/** Yapılandırma eksikse anlaşılır bir hata fırlatır. Modül seviyesinde çağırmayın. */
export function requireSupabaseEnv(): SupabaseEnv {
  const result = readSupabaseEnv();
  if (!result.ok) {
    throw new SupabaseNotConfiguredError(result.reason);
  }
  return result.env;
}

export class SupabaseNotConfiguredError extends Error {
  readonly code = "not_configured" as const;

  constructor(reason: string) {
    super(reason);
    this.name = "SupabaseNotConfiguredError";
  }
}

export function isSupabaseConfigured(): boolean {
  return readSupabaseEnv().ok;
}

/**
 * Keep browser and server behaviour aligned when Supabase is not configured.
 * Without this fallback the server uses local rooms while the browser tries to
 * create a Supabase anonymous session before it can create a room.
 */
export function shouldUseLocalRooms(
  source: Record<string, string | undefined>,
): boolean {
  return (
    source[LOCAL_ROOMS_PUBLIC_ENV] === "true" ||
    !validateSupabaseEnv(source).ok
  );
}

export function isLocalRoomsEnabled(): boolean {
  return shouldUseLocalRooms({
    [SUPABASE_URL_ENV]: process.env.NEXT_PUBLIC_SUPABASE_URL,
    [SUPABASE_ANON_KEY_ENV]: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    [LOCAL_ROOMS_PUBLIC_ENV]: process.env.NEXT_PUBLIC_USE_LOCAL_ROOMS,
  });
}
