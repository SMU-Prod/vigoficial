import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pular checagem de tipos no build — erros de tipagem não afetam runtime.
  // O TypeScript roda no lint/CI separado; aqui só precisamos compilar.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  output: "standalone",
  serverExternalPackages: ["bullmq", "ioredis", "playwright", "bcryptjs"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.r2.cloudflarestorage.com",
      },
    ],
  },
};

export default nextConfig;
