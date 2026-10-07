"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Kendi logosunu ve düzenini taşıyan, üst menünün gösterilmediği sayfalar. */
const PATHS_WITHOUT_HEADER = new Set(["/giris"]);

/**
 * Üst menüyü belirli sayfalarda gizler.
 *
 * `SiteHeader` bir Server Component olarak `children` içinde gelir; bu bileşen
 * yalnızca adrese bakıp onu gösterip göstermemeye karar verir.
 */
export function HeaderVisibility({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return PATHS_WITHOUT_HEADER.has(pathname) ? null : children;
}
