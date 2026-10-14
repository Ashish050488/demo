import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared validation package is plain ES modules inside the workspace.
  transpilePackages: ["@prefill/shared"],
};

export default nextConfig;
