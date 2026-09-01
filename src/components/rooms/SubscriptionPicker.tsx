"use client";

import { SUBSCRIPTION_OPTIONS } from "@/lib/rooms/subscriptions";
import type { TargetProviderKey } from "@/lib/tmdb/types";

/**
 * Abonelik seçimi.
 *
 * Oda kuran kişi ve davete katılan kişi AYNI bileşeni kullanır: iki tarafın
 * gördüğü liste ve anahtarlar hiçbir koşulda ayrışamaz. Liste tek kaynaktan
 * (`SUBSCRIPTION_OPTIONS` → `TARGET_PROVIDERS`) gelir.
 *
 * Seçim bir beyandır, doğrulanmış bir abonelik değildir: kullanıcı neye sahip
 * olduğunu kendisi söyler. Öneriler bu beyanların KESİŞİMİNDEN üretilir.
 */
export function SubscriptionPicker({
  idPrefix,
  legend,
  description,
  value,
  onChange,
  disabled = false,
}: {
  /** Aynı sayfada iki picker olabildiği için input id'leri ayrıştırılır. */
  idPrefix: string;
  legend: string;
  description?: string;
  value: readonly TargetProviderKey[];
  onChange: (next: TargetProviderKey[]) => void;
  disabled?: boolean;
}) {
  const selected = new Set(value);

  function toggle(key: TargetProviderKey) {
    // Sıra katalog sırasına göre yeniden kurulur; gönderim sırası tıklama
    // sırasına göre değişmez.
    onChange(
      SUBSCRIPTION_OPTIONS.filter((option) =>
        option.key === key ? !selected.has(key) : selected.has(option.key),
      ).map((option) => option.key),
    );
  }

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="text-sm font-semibold">{legend}</legend>

      {description ? (
        <p className="mt-1 text-xs text-black/60 dark:text-white/60">
          {description}
        </p>
      ) : null}

      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {SUBSCRIPTION_OPTIONS.map((option) => {
          const inputId = `${idPrefix}-${option.key}`;
          const checked = selected.has(option.key);

          return (
            <li key={option.key}>
              <label
                htmlFor={inputId}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  checked
                    ? "border-black/60 bg-black/[0.04] font-medium dark:border-white/60 dark:bg-white/10"
                    : "border-black/20 hover:bg-black/[0.03] dark:border-white/25 dark:hover:bg-white/[0.06]"
                }`}
              >
                <input
                  id={inputId}
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(option.key)}
                  className="size-4 shrink-0"
                />
                <span className="min-w-0 break-words">{option.label}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
