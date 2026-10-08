import Link from "next/link";

import { Wordmark } from "@/components/brand/Logo";

const SECTIONS = [
  {
    href: "/akis",
    title: "Akış",
    text: "Filmler hakkında paylaşım yapın, yorumlara katılın, beğenin ve repostlayın.",
  },
  {
    href: "/ara",
    title: "Ara",
    text: "Bir filmin Türkiye’de Netflix, Prime Video, Disney+ ve diğer platformlarda olup olmadığını görün.",
  },
  {
    href: "/kutuphanem",
    title: "Kütüphanem",
    text: "İzleyeceklerinizi ve izlediklerinizi tutun; puan ve kişisel not ekleyin.",
  },
  {
    href: "/rooms",
    title: "Odalar",
    text: "Arkadaşlarınızla oda kurun; çarkla ya da oylamayla birlikte film seçin.",
  },
];

/** Tanıtım sayfası: siteye girenler önce burada ne olduğunu görür, sonra akışa geçer. */
export default function LandingPage() {
  return (
    <main className="flex flex-1 flex-col">
      <div aria-hidden="true" className="flex flex-col gap-1">
        <span className="h-1 bg-brand-red" />
        <span className="h-1 bg-wm-foreground" />
      </div>

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-12 px-4 py-8 sm:px-8 lg:gap-14 lg:py-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Wordmark size="md" />
          <Link href="/giris" className="text-sm font-medium">
            Giriş yap
          </Link>
        </header>

        <section className="flex flex-col gap-6">
          <p className="text-xs font-semibold tracking-wide text-brand-green uppercase">
            Türkçe film topluluğu
          </p>
          <h1 className="font-display text-[52px] leading-[0.95] tracking-[0.02em] sm:text-[80px]">
            Filmleri birlikte <span className="text-brand-red">konuşun</span>,
            birlikte <span className="text-brand-green">seçin</span>.
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-ink-70">
            WatchMuse; film sohbetlerini, Türkiye’deki platform bilgisini,
            kişisel film kütüphanenizi ve arkadaşlarınızla film seçtiğiniz
            odaları tek yerde toplar.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/akis"
              className="inline-flex min-h-11 items-center rounded-lg bg-fill-inverse px-5 text-sm font-semibold text-on-inverse no-underline"
            >
              Akışa gir
            </Link>
            <Link
              href="/ara"
              className="inline-flex min-h-11 items-center rounded-lg border border-line-20 px-5 text-sm font-medium text-wm-foreground no-underline transition-colors hover:bg-fill-hover"
            >
              Bir film ara
            </Link>
          </div>
        </section>

        <section aria-labelledby="icindekiler" className="flex flex-col gap-4">
          <h2
            id="icindekiler"
            className="text-xs font-semibold tracking-wide text-ink-50 uppercase"
          >
            İçinde neler var
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {SECTIONS.map((section, index) => (
              <li key={section.href}>
                <Link
                  href={section.href}
                  className="flex h-full flex-col gap-2 rounded-xl border border-line-10 p-4 text-wm-foreground no-underline transition-colors hover:border-brand-green"
                >
                  <span className="font-display text-xl leading-none tracking-[0.06em] text-brand-red">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="font-display text-[30px] leading-none tracking-[0.04em]">
                    {section.title}
                  </span>
                  <span className="text-sm leading-relaxed text-ink-60">
                    {section.text}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-auto border-t border-line-10 pt-4 text-xs text-ink-50">
          Film bilgileri ve afişler TMDb’den gelir.
        </footer>
      </div>
    </main>
  );
}
