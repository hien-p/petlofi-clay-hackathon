import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@petlofi/agent"],
  typedRoutes: true
};

export default nextConfig;
