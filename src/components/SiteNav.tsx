"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { href: "/akis", label: "Akış" },
  { href: "/ara", label: "Ara" },
  { href: "/kutuphanem", label: "Kütüphanem" },
  { href: "/rooms", label: "Odalar" },
  { href: "/hesabim", label: "Hesabım" },
];

/** Sol paneldeki bölüm bağlantıları; açık olan bölüm yeşil çizgiyle işaretlenir. */
export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Ana gezinme" className="order-last -mx-1 w-full lg:order-none lg:mx-0">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {SECTIONS.map((section) => {
          const active =
            pathname === section.href || pathname.startsWith(`${section.href}/`);
          return (
            <li key={section.href} className="shrink-0">
              <Link
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 items-center rounded-lg whitespace-nowrap border-b-2 px-3 text-sm no-underline transition-colors hover:bg-fill-hover lg:border-b-0 lg:border-l-2 ${
                  active
                    ? "border-brand-green bg-fill-hover font-semibold text-wm-foreground"
                    : "border-transparent text-ink-70"
                }`}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
