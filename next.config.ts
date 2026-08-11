import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Davet bağlantısı token'ı yol segmentinde taşır. `no-referrer`,
        // kullanıcı bu sayfadan dışarı bir bağlantıya tıkladığında token'ın
        // `Referer` başlığıyla üçüncü taraflara sızmasını engeller.
        source: "/invite/:token*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          // Davet sayfası hiçbir koşulda önbelleğe alınmamalıdır.
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
  images: {
    // TMDb afişleri için tek izinli uzak kaynak.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
        search: "",
      },
    ],
  },
};

export default nextConfig;
