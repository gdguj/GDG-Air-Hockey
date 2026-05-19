import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    // @ts-ignore
    devIndicator: false
  }
};

export default nextConfig;