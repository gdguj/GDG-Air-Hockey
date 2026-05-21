import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const repoName = "GDG-Air-Hockey";

const nextConfig: NextConfig = {
  devIndicators: false,
  output: "export",
  basePath: isProd ? `/${repoName}` : "",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;