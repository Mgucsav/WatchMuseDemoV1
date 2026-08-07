import "server-only";

/**
 * Süreç içi, süre sınırlı basit bir önbellek.
 *
 * TMDb istekleri `Authorization` başlığı taşıdığı için Next.js'in fetch data
 * cache'i bu istekleri güvenilir biçimde saklamıyor. Önbellek davranışının
 * öngörülebilir olması adına saklama işini bu katman üstleniyor.
 *
 * Bilinen sınırlama: veri yalnızca çalışan Node.js süreci içinde tutulur,
 * yeniden başlatmada sıfırlanır ve birden fazla örnek arasında paylaşılmaz.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface TtlCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  clear(): void;
}

export function createTtlCache<T>(options: {
  ttlMs: number;
  maxEntries: number;
}): TtlCache<T> {
  const { ttlMs, maxEntries } = options;
  const entries = new Map<string, CacheEntry<T>>();

  function prune(now: number): void {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) {
        entries.delete(key);
      }
    }
  }

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;

      if (entry.expiresAt <= Date.now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },

    set(key, value) {
      const now = Date.now();

      if (entries.size >= maxEntries) {
        prune(now);
        // Süresi dolmamış kayıtlar sınırı hâlâ aşıyorsa en eski kaydı düşür.
        while (entries.size >= maxEntries) {
          const oldestKey = entries.keys().next().value;
          if (oldestKey === undefined) break;
          entries.delete(oldestKey);
        }
      }

      entries.set(key, { value, expiresAt: now + ttlMs });
    },

    clear() {
      entries.clear();
    },
  };
}
