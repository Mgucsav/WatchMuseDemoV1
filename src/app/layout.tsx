import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { SiteHeader } from "@/components/SiteHeader";
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

export const metadata: Metadata = {
  title: "WatchMuse — Film topluluğu",
  description:
    "Filmler hakkında paylaşım yapın, yorumlara katılın, birlikte film seçin ve kişisel film kütüphanenizi yönetin.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
      <body className="flex min-h-full flex-col watchmuse-retro film-grain">
        <AnonymousSessionBootstrap />
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
