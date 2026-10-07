import type { Metadata } from "next";
import { Bebas_Neue, Geist, Geist_Mono } from "next/font/google";

import { SidebarVisibility } from "@/components/SidebarVisibility";
import { SiteSidebar } from "@/components/SiteSidebar";
import { AnonymousSessionBootstrap } from "@/components/auth/AnonymousSessionBootstrap";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Logo yazısı ve tanıtım başlıkları için retro sinema afişi yazı tipi. */
const bebasNeue = Bebas_Neue({
  variable: "--font-bebas-neue",
  weight: "400",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "WatchMuse — Film topluluğu",
  description:
    "Filmler hakkında paylaşım yapın, yorumlara katılın, birlikte film seçin ve kişisel film kütüphanenizi yönetin.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="tr"
      className={`dark ${geistSans.variable} ${geistMono.variable} ${bebasNeue.variable} h-full antialiased`}
      >
      <body className="flex min-h-full flex-col lg:flex-row watchmuse-retro film-grain">
        <AnonymousSessionBootstrap />
        <SidebarVisibility>
          <SiteSidebar />
        </SidebarVisibility>
        {children}
      </body>
    </html>
  );
}
