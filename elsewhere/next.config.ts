import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/social",
        destination: "/feed",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
