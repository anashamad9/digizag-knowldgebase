import type { NextConfig } from "next";
import { developmentHosts } from "./lib/request-origin";
const config: NextConfig = {
  allowedDevOrigins: developmentHosts,
  distDir: process.env.BRAIN_TEST_BUILD === "1" ? ".next/e2e" : ".next",
  devIndicators: false,
  serverExternalPackages: ["pdf-parse"],
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default config;
