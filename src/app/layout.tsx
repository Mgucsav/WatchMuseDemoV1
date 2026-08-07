import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "WatchMuse — Film Abonelik Kontrolü",
  description:
    "WatchMuse: TMDb verisiyle bir filmin Türkiye'de Netflix veya Amazon Prime Video aboneliğine dahil olup olmadığını kontrol edin.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col watchmuse-retro film-grain">
        {children}
      </body>
    </html>
  );
}
