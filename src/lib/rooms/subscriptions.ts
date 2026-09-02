import { TARGET_PROVIDERS } from "@/lib/tmdb/constants";
import type { TargetProviderKey } from "@/lib/tmdb/types";

/**
 * Oda aboneliklerinin saf modeli.
 *
 * Her katılımcı odaya girerken hangi platformlara abone olduğunu seçer; tur
 * adayları YALNIZCA iki katılımcının ORTAK platformlarından toplanır. Bu modül
 * o kesişimi ve girdi doğrulamasını tanımlar.
 *
 * Sunucuya özel bir bağımlılığı yoktur (`server-only` importu bilinçli olarak
 * yok): aynı kurallar hem seçim arayüzünde hem API sınırında çalışır. Böylece
 * istemcinin gösterdiği liste ile sunucunun kabul ettiği liste ayrışamaz.
 */

export interface SubscriptionOption {
  key: TargetProviderKey;
  label: string;
}

/** Seçilebilir platformlar; katalog sırası arayüzdeki sıradır. */
export const SUBSCRIPTION_OPTIONS: readonly SubscriptionOption[] =
  TARGET_PROVIDERS.map(({ key, label }) => ({ key, label }));

/** Bir katılımcı en fazla katalogdaki kadar platform seçebilir. */
export const MAX_SUBSCRIPTIONS = SUBSCRIPTION_OPTIONS.length;

const OPTION_ORDER = new Map(
  SUBSCRIPTION_OPTIONS.map((option, index) => [option.key, index] as const),
);

export function isSubscriptionKey(value: unknown): value is TargetProviderKey {
  return typeof value === "string" && OPTION_ORDER.has(value as TargetProviderKey);
}

export function subscriptionLabel(key: TargetProviderKey): string {
  return SUBSCRIPTION_OPTIONS.find((option) => option.key === key)?.label ?? key;
}

function sortByCatalog(keys: TargetProviderKey[]): TargetProviderKey[] {
  return keys.sort(
    (left, right) =>
      (OPTION_ORDER.get(left) ?? 0) - (OPTION_ORDER.get(right) ?? 0),
  );
}

/**
 * GÜVEN SINIRI: kullanıcıdan gelen seçimi doğrular.
 *
 * Tanınmayan bir anahtar SESSİZCE ATILMAZ — bütün seçim reddedilir (`null`).
 * Aksi halde kullanıcı "Netflix + tanınmayan" gönderip farkında olmadan
 * yalnızca Netflix'e razı olmuş sayılabilirdi. En az bir platform zorunludur:
 * boş seçim, ortak küme üretemez.
 */
export function normalizeSubscriptionSelection(
  value: unknown,
): TargetProviderKey[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (value.length > MAX_SUBSCRIPTIONS) return null;
  if (!value.every(isSubscriptionKey)) return null;

  const unique = [...new Set(value)];
  return sortByCatalog(unique);
}

/**
 * Veritabanından/başka bir katılımcıdan okunan listeyi ele alır.
 *
 * Burada tolerans BİLİNÇLİDİR: katalogdan kaldırılmış eski bir anahtar, odanın
 * tamamını okunamaz hale getirmemelidir; yalnızca listeden düşer.
 */
export function parseStoredSubscriptions(value: unknown): TargetProviderKey[] {
  if (!Array.isArray(value)) return [];
  return sortByCatalog([...new Set(value.filter(isSubscriptionKey))]);
}

/** İki katılımcının ortak platformları; katalog sırasında döner. */
export function sharedSubscriptions(
  first: readonly TargetProviderKey[],
  second: readonly TargetProviderKey[],
): TargetProviderKey[] {
  const other = new Set(second);
  return sortByCatalog(first.filter((key) => other.has(key)));
}

/** Bütün katılımcıların ortak platformları; boş/tek kişilik odada sonuç yoktur. */
export function sharedSubscriptionsForAll(
  selections: readonly (readonly TargetProviderKey[])[],
): TargetProviderKey[] {
  if (selections.length < 2) return [];

  return selections.slice(1).reduce<TargetProviderKey[]>(
    (shared, current) => sharedSubscriptions(shared, current),
    [...selections[0]],
  );
}

/**
 * Ortak platformların TMDb (JustWatch) sağlayıcı ID'leri.
 *
 * Reklamlı paket varyantları da aynı aboneliğe dahil sayıldığı için katalogdaki
 * bütün ID'ler döner; TMDb `with_watch_providers` bu listeyi VEYA olarak yorumlar.
 */
export function tmdbProviderIdsFor(
  keys: readonly TargetProviderKey[],
): number[] {
  const selected = new Set(keys);
  const ids = TARGET_PROVIDERS.filter((provider) => selected.has(provider.key))
    .flatMap((provider) => [...provider.tmdbProviderIds]);
  return [...new Set(ids)].sort((left, right) => left - right);
}
