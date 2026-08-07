import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
