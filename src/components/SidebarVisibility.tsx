"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Sol panelin gösterilmediği, kendi logosunu ve tam ekran düzenini taşıyan
 * sayfalar: tanıtım sayfası ve giriş.
 */
const PATHS_WITHOUT_SIDEBAR = new Set(["/", "/giris"]);

/**
 * Sol paneli belirli sayfalarda gizler.
 *
 * `SiteSidebar` bir Server Component olarak `children` içinde gelir; bu
 * bileşen yalnızca adrese bakıp onu gösterip göstermemeye karar verir.
 */
export function SidebarVisibility({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return PATHS_WITHOUT_SIDEBAR.has(pathname) ? null : children;
}
